/* Gen 모델 동일성 확인 — 해석·설계 검토·최적화 직전. 앱이 보낸 페이로드(S.built.sent)와 지금 Gen 을 비교해
   다르면 GenChangedError 로 중단(이전 앱 정보로 해석·검토하지 않음). 13개 DB GET ≈ 1.7 s (라이브 샘플). */
import { SYNC_DBS, dbDifferences, diffText, type SyncDiff } from '../domain/genSync'
import { t } from '../i18n'
import { mapi } from '../mapi/client'
import { S } from '../state/store'
import { log } from '../state/ui'
import { stage } from './job'

export class GenChangedError extends Error {
  constructor(readonly diffs: SyncDiff[]) { super(diffs.map(diffText).join('; ')); this.name = 'GenChangedError' }
}

/** sent·dbs 기본값 = 공장 앱(S.built.sent, SYNC_DBS). 골조 앱은 F.built.P 와 자기 DB 목록을 넘긴다 (actions/frame.ts) */
export async function assertGenSync(sent: Record<string, any> | undefined = S.built?.sent, dbList: readonly string[] = SYNC_DBS): Promise<void> {
  if (!sent) return
  const dbs = dbList.filter((db) => sent[db])
  stage('st_sync', dbs.length)
  const diffs: SyncDiff[] = []
  const got: Record<string, any> = {}
  for (const db of dbs) {
    const r = await mapi<Record<string, unknown>>('GET', db, undefined, 'sync')
    got[db] = r?.[db]
    diffs.push(...dbDifferences(db, sent[db], got[db]))
  }
  /* 요소의 단면·재료 번호 → 이름도 함께 ('1 → 2' 만으로는 무엇이 바뀌었는지 모름) */
  const named = (db: 'SECT' | 'MATL', src: any, id: unknown) => {
    const n = src?.[String(id)]?.[db === 'SECT' ? 'SECT_NAME' : 'NAME']
    return n ? `${id} (${n})` : id
  }
  for (const d of diffs) if (d.db === 'ELEM' && (d.field === 'SECT' || d.field === 'MATL')) {
    d.expected = named(d.field, sent[d.field], d.expected)
    d.actual = named(d.field, got[d.field], d.actual)
  }
  if (diffs.length) {
    for (const d of diffs.slice(0, 20)) log(diffText(d), 'warn')
    S.genChanged = diffs.length
    throw new GenChangedError(diffs)
  }
  S.genChanged = 0
  log(t('log_sync_ok', dbs.length), 'ok')
}

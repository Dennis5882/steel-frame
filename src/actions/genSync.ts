/* Gen 모델 동일성 확인 — 해석·설계 검토·최적화 직전. 앱이 보낸 페이로드(S.built.sent)와 지금 Gen 을 비교해
   다르면 GenChangedError 로 중단(이전 앱 정보로 해석·검토하지 않음). 13개 DB GET ≈ 1.7 s (라이브 샘플). */
import { SYNC_DBS, compareGen, diffText, isRecord, type SyncDiff } from '../domain/genSync'
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
  stage('st_sync', dbList.filter((db) => isRecord(sent[db])).length)
  const { dbs, diffs } = await compareGen(sent, dbList, async (db) => (await mapi<Record<string, unknown>>('GET', db, undefined, 'sync'))?.[db])
  if (diffs.length) {
    for (const d of diffs.slice(0, 20)) log(diffText(d), 'warn')
    S.genChanged = diffs.length
    throw new GenChangedError(diffs)
  }
  S.genChanged = 0
  log(t('log_sync_ok', dbs.length), 'ok')
}

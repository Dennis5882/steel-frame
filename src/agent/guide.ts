/* GUIDE labels are localized. Each button carries a typed action independent of its translated text. */
import type { I18nKey } from '../i18n'
import type { Intent } from './parse'

/* 키 타입: 사전에 실제로 있는 g_* 키만 허용 — 항목 키 K 는 `${K}_cmd` 도 사전에 있어야 함 */
type CmdBase<K = I18nKey> = K extends `${infer B}_cmd` ? B : never
export type GuideItemKey = Extract<CmdBase, I18nKey>
export type GuideSecId = I18nKey extends infer K ? (K extends `g_${infer Id}` ? (Id extends `${string}_${string}` ? never : Id) : never) : never

export type GuideItem =
  | { div: true }
  | { note: Extract<I18nKey, `g_${string}_note`> }
  | { icon: string; key: GuideItemKey; action: Intent }

/** acc = 섹션 강조색(app.css .gsec[data-acc]) */
export interface GuideSection { id: GuideSecId; icon: string; acc: 'cyan' | 'blue' | 'amber' | 'green' | 'violet'; open: boolean; items: GuideItem[] }

export const GUIDE: GuideSection[] = [
  { id: 'model', acc: 'cyan', icon: '⊞', open: true, items: [
    { icon: '⌂', key: 'g_model_1', action: { intent: 'new', mode: 'template', tpl: 'small', params: {} } },
    { icon: '🏭', key: 'g_model_2', action: { intent: 'new', mode: 'template', tpl: 'general', params: {} } },
    { icon: '↔', key: 'g_model_3', action: { intent: 'new', mode: 'template', tpl: 'long', params: {} } },
    { icon: '📦', key: 'g_model_4', action: { intent: 'new', mode: 'template', tpl: 'logistics', params: {} } },
    { div: true },
    { icon: '🏗', key: 'g_model_5', action: { intent: 'new', mode: 'free', params: {} } },
    { note: 'g_model_note' },
  ] },
  { id: 'analysis', acc: 'green', icon: '∑', open: true, items: [
    { icon: '▶', key: 'g_analysis_1', action: { intent: 'analyze' } },
  ] },
  { id: 'result', acc: 'amber', icon: '▤', open: true, items: [
    { icon: '⊥', key: 'g_result_1', action: { intent: 'reactions' } },
  ] },
  { id: 'design', acc: 'blue', icon: '◫', open: true, items: [
    { icon: '✓', key: 'g_design_1', action: { intent: 'design' } },
    { icon: '▦', key: 'g_design_2', action: { intent: 'report' } },
    { icon: '⎙', key: 'g_design_5', action: { intent: 'pdf' } },
    { icon: '⌗', key: 'g_design_3', action: { intent: 'drawings' } },
    { icon: '∑', key: 'g_design_6', action: { intent: 'quantities' } },
    { icon: '⚖', key: 'g_design_4', action: { intent: 'optimize' } },
    { note: 'g_design_note' },
  ] },
  { id: 'misc', acc: 'violet', icon: '⊟', open: false, items: [
    { icon: '◎', key: 'g_misc_1', action: { intent: 'status' } },
    { icon: '◈', key: 'g_misc_2', action: { intent: 'conn' } },
    { icon: '⧉', key: 'g_misc_4', action: { intent: 'copy_link' } },
    { div: true },
    { icon: '↺', key: 'g_misc_3', action: { intent: 'clear' } },
  ] },
  { id: 'help', acc: 'cyan', icon: '?', open: false, items: [
    { icon: '≡', key: 'g_help_1', action: { intent: 'help' } },
    { icon: '✎', key: 'g_help_2', action: { intent: 'release_notes' } },
  ] },
]

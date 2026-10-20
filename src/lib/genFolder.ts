/* Gen NX 저장 폴더 읽기 — 상세 계산서의 캡처 PNG (Gen 이 같은 PC 의 저장 폴더에 쓴다).
   브라우저는 PC 파일을 마음대로 못 읽으므로 File System Access API(Chrome·Edge)로 사용자가 폴더를 한 번 고른다(읽기 전용).
   고른 폴더는 이 탭이 열려 있는 동안 기억한다. 파일은 서버로 보내지 않는다. */

interface FileHandleLike { getFile(): Promise<File> }
export interface DirHandleLike {
  name: string
  getFileHandle(name: string): Promise<FileHandleLike>
  queryPermission?(o: { mode: 'read' }): Promise<PermissionState>
  requestPermission?(o: { mode: 'read' }): Promise<PermissionState>
}

let picked: DirHandleLike | null = null

export const folderAccessSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

/** 저장 폴더 경로의 마지막 이름 ('C:/temp' → 'temp') */
export const folderName = (path: string) => path.trim().replace(/[\\/]+$/, '').split(/[\\/]/).pop()?.toLowerCase() ?? ''

/** 사용자 동작(클릭) 안에서 불러야 한다. 이미 허용된 폴더면 그대로 */
export async function pickGenFolder(): Promise<DirHandleLike> {
  if (picked && (await picked.queryPermission?.({ mode: 'read' })) === 'granted') return picked
  if (picked && (await picked.requestPermission?.({ mode: 'read' })) === 'granted') return picked
  const w = window as unknown as { showDirectoryPicker(o: object): Promise<DirHandleLike> }
  picked = await w.showDirectoryPicker({ id: 'sf-gen-folder', mode: 'read' })
  return picked
}

export const forgetGenFolder = () => { picked = null }

export interface FolderImage { src: string; width: number; height: number; bytes: number }

/** PNG 하나 읽기 → data URL + 크기. Gen 이 파일을 막 쓰는 중일 수 있어 잠깐씩 다시 시도 */
export async function readFolderImage(dir: DirHandleLike, name: string, tries = 10): Promise<FolderImage | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const file = await (await dir.getFileHandle(name)).getFile()
      if (file.size > 0) {
        const bmp = await createImageBitmap(file)
        const src = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file) })
        const out = { src, width: bmp.width, height: bmp.height, bytes: file.size }
        bmp.close()
        return out
      }
    } catch { /* 아직 없음·쓰는 중 */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  return null
}

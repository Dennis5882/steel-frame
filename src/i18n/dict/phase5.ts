const keys = ['add_runway','add_header','add_wallOpening','add_section','add_face','add_bay','add_height','add_headerSection','add_invalid_opening','sv_runwayDefl','add_runway_note','add_opening_note'] as const
const dict=(values:string[])=>{
  if(values.length!==keys.length || values.some((v)=>v.includes('???')))throw new Error('Phase 5 translation mismatch')
  return Object.fromEntries(keys.map((k,i)=>[k,values[i]])) as Record<typeof keys[number],string>
}
export const p5En=dict([
  'Runway beam model','Door header','Closed full-bay wall door','Runway section','Side wall','Bay number','Door height','Header section',
  'Use an unbraced side-wall bay, an existing girt level, H section and confirmed source. Platforms must not obstruct the closed door.',
  'Runway relative vertical deflection',
  'Runway elevation must differ from girt levels. Simply supported beams on column axes; eccentric moments remain on columns. Sampled static wheel positions include span interiors. Deflection includes the entered impact factor. Fatigue, local wheel bearing, rail/bracket details, lateral shear/torsion and open-door wind conditions require separate review.',
  'One closed door fills one side-wall bay from ground to an existing girt level. Existing columns act as jambs; an H header replaces the top girt. Lower girts are removed. Closed-door gravity/wind strip loads transfer to jambs; the top strip loads the header. The closed wall pressure area is retained. Opening during wind requires separate enclosure assessment. Braced bays are blocked.'
])
export const p5Ko=dict([
  '주행보 모델','출입문 상인방','닫힌 전 베이 벽 출입문','주행보 단면','측벽','베이 번호','출입문 높이','상인방 단면',
  '가새 없는 측벽 베이·기존 거트 높이·H형 단면·출처 확인이 필요합니다. 플랫폼이 출입문을 가리면 안 됩니다.',
  '주행보 상대 수직 처짐',
  '거트와 다른 높이를 사용합니다. 기둥 축상의 단순보이며 편심 모멘트는 기둥에 전달합니다. 경간 내부를 포함한 정적 차륜 위치를 표본 해석하며 입력 충격계수를 처짐에도 포함합니다. 피로·차륜 국부지압·레일·브래킷 상세·횡전단·비틀림 및 문을 열었을 때의 풍하중은 별도 검토입니다.',
  '측벽 한 베이 전체 폭의 닫힌 출입문 1개를 지면부터 기존 거트 높이까지 만듭니다. 기존 기둥을 문설주로 사용하고 상단 거트를 H형 상인방으로 바꿉니다. 아래 거트는 제거합니다. 닫힌 문의 고정·풍하중 띠는 문설주로, 상단 띠는 상인방으로 전달하며 닫힌 벽 풍압 면적은 유지합니다. 강풍 중 문 개방은 밀폐 분류를 별도 검토하세요. 가새 베이는 선택할 수 없습니다.'
])
export const p5TW=dict([
  '軌道梁模型','門楣梁','封閉式全跨側牆門','軌道梁斷面','側牆','跨編號','門高','門楣梁斷面',
  '請選無斜撐側牆跨、既有牆梁高程、H 型斷面並確認來源；平台不得阻擋門口。',
  '軌道梁相對垂直撓度',
  '軌道梁高程須與牆梁錯開。採柱軸線簡支梁，偏心彎矩留在柱上。靜態輪位包含跨內位置，撓度包含輸入衝擊係數。疲勞、輪壓局部承載、軌道與牛腿細節、橫向剪力與扭轉及開門風載須另行審查。',
  '單一側牆全跨封閉門，從地面至既有牆梁高程。既有柱作門柱；頂部牆梁改為 H 型門楣梁，下方牆梁移除。封閉門靜載與風載條帶傳至門柱，頂部條帶傳至門楣梁；保留封閉牆風壓面積。風中開門須另評估內壓分類；斜撐跨禁止開門。'
])
export const p5CN=dict([
  '吊车梁模型','门楣梁','封闭式整跨侧墙门','吊车梁截面','侧墙','跨编号','门高','门楣梁截面',
  '请选择无支撑侧墙跨、既有墙梁标高、H 型截面并确认来源；平台不得遮挡门口。',
  '吊车梁相对竖向挠度',
  '吊车梁标高须与墙梁错开。采用柱轴线简支梁，偏心弯矩留在柱上。静态轮位包括跨内位置，挠度包含输入冲击系数。疲劳、轮压局部承载、轨道与牛腿细节、横向剪力与扭转以及开门风荷载须另行审查。',
  '单个侧墙整跨封闭门，从地面至既有墙梁标高。既有柱作门柱；顶部墙梁改为 H 型门楣梁，下方墙梁移除。封闭门恒载与风荷载条带传至门柱，顶部条带传至门楣梁；保留封闭墙风压面积。风中开门须另评估内压分类；支撑跨禁止开门。'
])

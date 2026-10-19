const keys=['p6_title','p6_roof','p6_floor','p6_link','p6_roofBeam','p6_floorBeam','p6_roofNote','p6_floorNote','p6_linkNote','p6_reactionNote','p6_integralNote','p6_invalidRoof','p6_invalidFloor','p6_invalidLink','p6_mode','p6_sliding','p6_separate','p6_integral','p6_frame','p6_aMovementMm','p6_bMovementMm','p6_thermalMovementMm','p6_toleranceMm','p6_availableGapMm','p6_seatLengthMm','p6_minBearingMm','p6_loadFactor','p6_case','p6_addCase','sv_linkGap','sv_linkSeat'] as const
const dict=(v:string[])=>{if(v.length!==keys.length||v.some((s)=>s.includes('???')))throw new Error('Phase 6 translation mismatch');return Object.fromEntries(keys.map((k,i)=>[k,v[i]])) as Record<typeof keys[number],string>}
export const p6En={...dict([
  'Openings and building interface','Closed roof hatch / skylight','Platform floor opening','Building interface assessment','Roof opening trimmer','Floor opening edge beam',
  'Closed, weather-tight roof cover only. Select one unbraced bay and grid lines inside a single roof plane. Interior purlins are removed and edge members become H trimmers. Existing roof gravity, snow and wind area are retained and transferred to the trimmers. Cover capacity, local wind zones, attachment and drainage need separate design.',
  'One bay, aligned with the platform beam grid and inside its edges. Remove internal secondary beams and exclude the void from floor loads and seismic weight. Existing perimeter beams remain; select platform beam sections for the required edge capacity. No slab or diaphragm action is assumed.',
  'Web assessment of relative movement, gap and remaining seat. Conservative sum of the two buildings’ movement magnitudes, thermal movement and tolerance. Inputs must use the same direction and hazard basis. This does not model the other building or create a bridge. Sliding mode transfers designer-confirmed reactions to this factory; separated mode creates no connection.',
  'Enter simultaneous signed actions exerted by the link on this factory in global X/Y/Z. Each row is one externally analyzed state, not independently enveloped maxima. Reactions are not converted to seismic mass. Only project gravity + interface combinations are added; wind/seismic concurrency and coupled building response require separate design.',
  'Integral connection requires a coupled model of both buildings. Automatic Gen generation is blocked in this mode.',
  'Check roof grid lines, H section, unbraced bay, equipment conflicts and source confirmation.',
  'Check platform grid lines, one-bay extent, interior boundary and source confirmation.',
  'Check movement basis, interface location, nonzero simultaneous reactions, factors and confirmation. Integral connections require a coupled model.',
  'Connection behavior','Fixed / sliding — reaction interface','Structurally separated — movement review','Integral — coupled model required','Frame number','Building A movement magnitude','Building B movement magnitude','Thermal movement magnitude','Construction tolerance','Available gap','Seat length','Minimum residual bearing length','Project interface load factor','External reaction state','Add reaction state','Interface gap demand','Interface seat movement demand'
]),sv_roofOpeningDefl:'Roof trimmer deflection (web estimate)',p6_roofDeflNote:'Web estimate: 5qL^4/(384EI), D + roof live or each snow case, using app section properties. It excludes shear deflection and local cover behavior.',p6_required:(d:string,g:string,s:string)=>`Required movement ${d} mm · gap reserve ${g} mm · seat reserve ${s} mm`}
export const p6Ko={...dict([
  '개구부·건물 연결부','닫힌 지붕 해치·채광창','플랫폼 바닥 개구부','연결동 인터페이스 검토','지붕 개구부 보강보','바닥 개구부 테두리보',
  '닫힌 방수 덮개가 있는 개구부입니다. 가새 없는 한 베이와 한 지붕면 내부 격자선을 선택합니다. 내부 퍼린을 제거하고 양쪽 경계 부재를 H형 보강보로 바꿉니다. 기존 지붕 고정·활·적설·풍하중 면적을 유지하여 보강보로 전달합니다. 덮개 내력·국부 풍압 구역·정착·배수는 별도 설계입니다.',
  '플랫폼 안쪽의 보 격자와 일치하는 한 베이 개구부입니다. 내부 작은보를 제거하고 빈 면적의 바닥 하중·지진중량을 제외합니다. 기존 테두리보는 유지하므로 필요한 내력에 맞춰 플랫폼 보 단면을 선택하세요. 슬래브·다이어프램 효과는 고려하지 않습니다.',
  '두 건물의 변위 크기·온도 이동·시공 오차를 보수적으로 더해 이격과 잔여 받침 길이를 웹에서 검토합니다. 동일 방향·재해 수준의 근거를 입력하세요. 외부 건물이나 연결교를 생성하는 기능은 아닙니다. 고정·이동형은 확인된 연결부 반력을 현재 공장에 전달하며, 구조 분리형은 연결 부재를 만들지 않습니다.',
  '연결부가 현재 공장에 가하는 동시 부재력을 전역 X/Y/Z의 부호를 포함해 입력하세요. 각 행은 외부 해석의 한 상태이며 성분별 최대값을 합친 값이 아닙니다. 반력을 지진 질량으로 변환하지 않습니다. 중력+연결 반력 조합을 추가하며 풍·지진 동시성 및 두 건물 결합 거동은 별도 설계입니다.',
  '일체형 연결은 두 건물의 결합 모델이 필요합니다. 이 모드에서는 자동 Gen 생성을 차단합니다.',
  '지붕 격자선·H형 단면·가새 없는 베이·설비 충돌·출처 확인을 점검하세요.',
  '플랫폼 보 격자·한 베이 범위·내부 경계·출처 확인을 점검하세요.',
  '변위 근거·연결 위치·0이 아닌 동시 반력·계수·확인을 점검하세요. 일체형은 결합 모델이 필요합니다.',
  '연결 거동','고정·이동형 — 반력 연계','구조 분리형 — 변위 검토','일체형 — 결합 모델 필요','골조 번호','건물 A 변위 크기','건물 B 변위 크기','온도 이동 크기','시공 오차','확보 이격','받침 길이','최소 잔여 지지 길이','프로젝트 연결 반력계수','외부 반력 상태','반력 상태 추가','연결부 이격 소요','연결부 받침 이동 소요'
]),sv_roofOpeningDefl:'지붕 보강보 처짐 (웹 추정)',p6_roofDeflNote:'웹 추정값은 5qL⁴/(384EI)이며 D+지붕 활하중 또는 각 적설 상태를 앱 단면 성능으로 계산합니다. 전단 변형·덮개 국부 거동은 제외합니다.',p6_required:(d:string,g:string,s:string)=>`소요 이동 ${d} mm · 이격 여유 ${g} mm · 받침 여유 ${s} mm`}
export const p6TW={...dict([
  '開口與建物連接介面','封閉屋頂檢修口／天窗','平台樓面開口','連接建物介面檢核','屋頂開口補強梁','樓面開口邊梁',
  '限具防水封閉蓋板的開口。選無斜撐單跨及單一屋面內網格線。移除內部檁條，邊界改為 H 型補強梁。保留原屋頂靜載、活載、雪載及風壓面積並傳至補強梁。蓋板、局部風壓、錨定及排水須另行設計。',
  '限平台內側與梁格對齊的單跨開口。移除內部次梁，扣除開口範圍樓面載重與地震重量。保留周邊梁，請選擇足夠的平台梁斷面。不考慮樓板及剛性樓板效果。',
  '以兩棟建物位移量、溫度位移與施工誤差的保守總和檢查間隙及剩餘支承長度。須使用同方向與相同災害等級資料。不建立外部建物或連接橋。固定／滑動模式將經確認反力傳至本廠房；結構分離模式不建立連接。',
  '輸入連接部對本廠房施加的整體 X/Y/Z 有號同步作用力。每列為外部分析的一個狀態，不可組合各分量獨立最大值。不將反力換算為地震質量。僅新增重力＋介面反力組合；風震同時性及兩棟建物耦合須另行設計。',
  '一體式連接須建立兩棟建物耦合模型，此模式禁止自動產生 Gen 模型。',
  '請檢查屋頂網格、H 型斷面、無斜撐跨、設備衝突及來源確認。',
  '請檢查平台梁格、單跨範圍、內側邊界及來源確認。',
  '請檢查位移依據、介面位置、非零同步反力、係數與確認；一體式須耦合模型。',
  '連接方式','固定／滑動－反力介面','結構分離－位移檢核','一體式－須耦合模型','構架編號','建物 A 位移量','建物 B 位移量','溫度位移量','施工誤差','可用間隙','支承座長度','最小剩餘支承長度','專案介面反力係數','外部反力狀態','新增反力狀態','介面間隙需求','介面支承位移需求'
]),sv_roofOpeningDefl:'屋頂補強梁撓度（網頁估算）',p6_roofDeflNote:'網頁估算採 5qL⁴/(384EI)，以程式斷面性質計算 D＋屋頂活載或各雪載狀態；不含剪切變形及蓋板局部行為。',p6_required:(d:string,g:string,s:string)=>`所需位移 ${d} mm · 間隙餘量 ${g} mm · 支承餘量 ${s} mm`}
export const p6CN={...dict([
  '洞口与建筑连接接口','封闭屋面检修口／天窗','平台楼面洞口','连接建筑接口验算','屋面洞口补强梁','楼面洞口边梁',
  '仅限带防水封闭盖板的洞口。选择无支撑单跨及单一屋面内网格线。移除内部檩条，边界改为 H 型补强梁。保留原屋面恒载、活载、雪载及风压面积并传至补强梁。盖板、局部风压、锚固及排水须另行设计。',
  '仅限平台内部与梁格对齐的单跨洞口。移除内部次梁，扣除洞口范围楼面荷载与地震重量。保留周边梁，请选择足够的平台梁截面。不考虑楼板及刚性楼板作用。',
  '以两栋建筑位移量、温度位移与施工误差的保守总和检查间隙及剩余支承长度。须使用同方向与相同灾害等级资料。不建立外部建筑或连接桥。固定／滑动模式将经确认反力传至本厂房；结构分离模式不建立连接。',
  '输入连接部对本厂房施加的整体 X/Y/Z 有号同步作用力。每行为外部分析的一个状态，不可组合各分量独立最大值。不将反力换算为地震质量。仅新增重力＋接口反力组合；风震同时性及两栋建筑耦合须另行设计。',
  '整体式连接须建立两栋建筑耦合模型，此模式禁止自动生成 Gen 模型。',
  '请检查屋面网格、H 型截面、无支撑跨、设备冲突及来源确认。',
  '请检查平台梁格、单跨范围、内部边界及来源确认。',
  '请检查位移依据、接口位置、非零同步反力、系数与确认；整体式须耦合模型。',
  '连接方式','固定／滑动－反力接口','结构分离－位移验算','整体式－须耦合模型','框架编号','建筑 A 位移量','建筑 B 位移量','温度位移量','施工误差','可用间隙','支承座长度','最小剩余支承长度','项目接口反力系数','外部反力状态','添加反力状态','接口间隙需求','接口支承位移需求'
]),sv_roofOpeningDefl:'屋面补强梁挠度（网页估算）',p6_roofDeflNote:'网页估算采用 5qL⁴/(384EI)，以程序截面性质计算 D＋屋面活载或各雪荷载状态；不含剪切变形及盖板局部行为。',p6_required:(d:string,g:string,s:string)=>`所需位移 ${d} mm · 间隙余量 ${g} mm · 支承余量 ${s} mm`}

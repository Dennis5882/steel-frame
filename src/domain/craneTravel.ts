import {baySpans,type FactorySpec} from './types'

/** Bay indices are inclusive; omitted travel always follows the complete building. */
export function craneTravel(s:FactorySpec) {
  const firstBay=s.additions?.crane?.travel?.firstBay??0,lastBay=s.additions?.crane?.travel?.lastBay??s.bays-1
  const valid=Number.isInteger(firstBay)&&Number.isInteger(lastBay)&&firstBay>=0&&lastBay>=firstBay&&lastBay<s.bays
  const allStations=baySpans(s).reduce<number[]>((a,v)=>{a.push(a.at(-1)!+v);return a},[0])
  const stations=valid?allStations.slice(firstBay,lastBay+2):[]
  return {firstBay,lastBay,valid,stations,start:stations[0]??NaN,end:stations.at(-1)??NaN,length:valid?stations.at(-1)!-stations[0]:NaN}
}

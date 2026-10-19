export function GET() {
  return Response.json({ status: 'ok', service: 'steel-frame', time: new Date().toISOString() })
}

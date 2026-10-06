// The site's address as a request reached it (App Hosting passes the public host on), for links that must be
// absolute: the podcast feed's (spec 019 item 5.1). Staging's feed then points at staging, the live one at live.
export function requestOrigin(request: Request): string {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
    const proto = request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
}

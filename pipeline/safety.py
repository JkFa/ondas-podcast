"""Segurança de entrada: o link vem de um formulário público, então só aceitamos https para hosts públicos,
com limite de tamanho e conferência de CADA redirecionamento (evita SSRF: 127.0.0.1, 169.254.x, redes privadas)."""
import ipaddress
import socket
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MAX_BYTES = 800 * 1024 * 1024  # 800 MB
ALLOWED_PORTS = {None, 80, 443}
AUDIO_TYPES = ("audio/", "video/", "application/octet-stream", "binary/octet-stream", "application/ogg")


class UnsafeUrl(ValueError):
    pass


def check_public_url(url, allow_http=False, resolver=socket.getaddrinfo):
    """Levanta UnsafeUrl se o link não for http(s) para um host público."""
    p = urllib.parse.urlsplit(url.strip())
    if p.scheme not in ("https",) + (("http",) if allow_http else ()):
        raise UnsafeUrl("o link precisa começar com https://")
    if p.username or p.password:
        raise UnsafeUrl("links com usuário e senha não são aceitos")
    if not p.hostname:
        raise UnsafeUrl("link sem endereço")
    try:
        port = p.port
    except ValueError:
        raise UnsafeUrl("porta inválida")
    if port not in ALLOWED_PORTS:
        raise UnsafeUrl("só as portas padrão (80/443) são aceitas")
    try:
        infos = resolver(p.hostname, port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise UnsafeUrl("não consegui resolver o endereço do link")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise UnsafeUrl("o link aponta para uma rede interna, que não é aceita")
    return url.strip()


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, allow_http, resolver):
        self.allow_http, self.resolver = allow_http, resolver

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_public_url(newurl, self.allow_http, self.resolver)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download_direct(url, dest, max_bytes=MAX_BYTES, timeout=60, allow_http=False, resolver=socket.getaddrinfo):
    """Baixa um arquivo de áudio por link direto. Devolve o Content-Type. Levanta UnsafeUrl/ValueError/OSError."""
    check_public_url(url, allow_http, resolver)
    opener = urllib.request.build_opener(_SafeRedirect(allow_http, resolver))
    req = urllib.request.Request(url, headers={"User-Agent": "ondas-publish/1.0 (+https://github.com/JkFa/ondas-podcast)"})
    with opener.open(req, timeout=timeout) as r:
        ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if ctype and not ctype.startswith(AUDIO_TYPES):
            raise ValueError(f"o link não é um arquivo de áudio (tipo {ctype}); para páginas de vídeo use o link do YouTube")
        length = int(r.headers.get("Content-Length") or 0)
        if length > max_bytes:
            raise ValueError(f"arquivo grande demais ({length / 1e6:.0f} MB; limite {max_bytes / 1e6:.0f} MB)")
        total = 0
        with open(dest, "wb") as f:
            while chunk := r.read(1 << 20):
                total += len(chunk)
                if total > max_bytes:
                    Path(dest).unlink(missing_ok=True)
                    raise ValueError(f"arquivo passou do limite de {max_bytes / 1e6:.0f} MB")
                f.write(chunk)
    return ctype

export interface ProvisionOptions {
  image?: 'vivaldi' | 'ungoogled-chromium' | 'microsoft-edge' | 'brave' | 'firefox' | 'chromium' |
    'google-chrome' | 'tor-browser' | 'remmina' | 'xfce' | 'vlc' | 'vncviewer',
  resolution?: '720p' | '1080p',
  fps?: 30 | 60,
  password: string,
  adminPassword: string
}


export function genProvisionScript(options: ProvisionOptions, doToken: string, subdomain: string): string {
  const image = options.image || 'firefox';
  const resp = options.resolution || '720p';
  const resolution = resp === '720p' ? '1280x720' : '1920x1080';
  const fps = options.fps || 30;
  const screen = `${resolution}@${fps}`;
  return `#!/bin/bash
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y upgrade

apt-get -y install certbot python3-certbot-dns-digitalocean
echo "dns_digitalocean_token = ${doToken}" > certbots-creds.ini
chmod go-rwx ~/certbot-creds.ini
certbot certonly --dns-digitalocean --dns-digitalocean-credentials ~/certbot-creds.ini -d ${subdomain} --register-unsafely-without-email
rm ~/certbot-creds.ini

apt-get -y install docker.io docker-compose

cat > docker-compose.yaml <<EOF
version "3.4"
services:
  neko:
    image: "m1k1o/neko:${image}"
    restart: "unless-stopped"
    shm_size: "8gb"
    ports:
      - "80:8080"
      - "52000-52100:52000-52100/udp"
    environment:
      NEKO_SCREEN: ${screen}
      NEKO_PASSWORD: ${options.password}
      NEKO_PASSWORD_ADMIN: ${options.adminPassword}
      NEKO_EPR: 52000-52100
      NEKO_ICELITE: 1
EOF

docker-compose up -d
`;
}

export default genProvisionScript;

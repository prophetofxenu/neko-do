export interface ProvisionOptions {
  image?: 'vivaldi' | 'ungoogled-chromium' | 'microsoft-edge' | 'brave' | 'firefox' | 'chromium' |
    'google-chrome' | 'tor-browser' | 'remmina' | 'xfce' | 'vlc' | 'vncviewer',
  resolution?: '720p' | '1080p',
  fps?: 30 | 60,
  password: string,
  adminPassword: string
}


export function genProvisionScript(options: ProvisionOptions,
  domain: string, subdomain: string): string {
  const image = options.image || 'firefox';
  const resp = options.resolution || '720p';
  const resolution = resp === '720p' ? '1280x720' : '1920x1080';
  const fps = options.fps || 30;
  const screen = `${resolution}@${fps}`;
  return `#!/bin/bash
set -e

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y upgrade

apt-get -y install ufw nginx certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/${domain} <<EOF
server {
  listen 80;
  server_name ${subdomain}.${domain};

  location / {
    proxy_pass http://localhost:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \\$http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_read_timeout 86400;
    proxy_set_header Host \\$host;
    proxy_set_header X-Real-IP \\$remote_addr;
    proxy_set_header X-Forwarded-For \\$remote_addr;
    proxy_set_header X-Forwarded-Host \\$host;
    proxy_set_header X-Forwarded-Port \\$server_port;
    proxy_set_header X-Forwarded-Protocol \\$scheme;
  }
}
EOF

ln -s /etc/nginx/sites-available/${domain} /etc/nginx/sites-enabled/
systemctl restart nginx
certbot -n --nginx -d ${subdomain}.${domain} --agree-tos --register-unsafely-without-email \
  --redirect
ufw allow 'Nginx HTTP'
ufw allow 'Nginx HTTPS'
ufw allow OpenSSH
ufw --force enable

apt-get -y install docker.io docker-compose

cat > docker-compose.yaml <<EOF
version: "3.4"
services:
  neko:
    image: "m1k1o/neko:${image}"
    restart: "unless-stopped"
    shm_size: "8gb"
    ports:
      - "8080:8080"
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

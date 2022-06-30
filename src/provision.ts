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

step=1
monitor_msg () {
  echo "$step:$1" > /monitoring/index.txt
  step=$(echo "$step+1" | bc)
}

apt-get update

mkdir /monitoring
apt-get -y install nginx
cat > /etc/nginx/sites-available/provision-monitor <<EOF
server {
  listen 6969;
  root /monitoring;
  index index.txt;

  location / {
  }
}
EOF

ln -s /etc/nginx/sites-available/provision-monitor /etc/nginx/sites-enabled/
systemctl restart nginx
monitor_msg 'nginx_ready'

DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
monitor_msg 'updates_finished'

apt-get -y install ufw certbot python3-certbot-nginx
monitor_msg 'ufw_certbot_installed'

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
monitor_msg 'nginx_configured'

certbot -n --nginx -d ${subdomain}.${domain} --agree-tos --register-unsafely-without-email \
  --redirect
monitor_msg 'cert_installed'

ufw allow 'Nginx HTTP'
ufw allow 'Nginx HTTPS'
ufw allow OpenSSH
ufw allow 6969
ufw --force enable
monitor_msg 'firewall_enabled'

apt-get -y install docker.io docker-compose
monitor_msg 'docker_installed'

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
monitor_msg 'ready'
`;
}

export default genProvisionScript;

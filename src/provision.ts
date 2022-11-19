import { randomPw } from './util';

export interface ProvisionOptions {
  image?: 'vivaldi' | 'ungoogled-chromium' | 'microsoft-edge' | 'brave' | 'firefox' | 'chromium' |
    'google-chrome' | 'tor-browser' | 'remmina' | 'xfce' | 'vlc' | 'vncviewer',
  resolution?: '720p' | '1080p',
  fps?: 30 | 60,
  password: string,
  adminPassword: string
}


export function makeProvisionOpts(opts: ProvisionOptions): ProvisionOptions {
  return {
    image: opts.image || 'firefox',
    resolution: opts.resolution || '1080p',
    fps: opts.fps || 30,
    password: opts.password || randomPw(),
    adminPassword: opts.adminPassword || randomPw()
  };
}


export function imageMap(imageName: string): string {
  const image = {
    'vivaldi':            'm1k1o/neko:vivaldi',
    'ungoogled-chromium': 'm1k1o/neko:ungoogled-chromium',
    'microsoft-edge':     'm1k1o/neko:microsoft-edge',
    'brave':              'm1k1o/neko:brave',
    'firefox':            'm1k1o/neko:firefox',
    'chromium':           'm1k1o/neko:chromium',
    'google-chrome':      'm1k1o/neko:google-chrome',
    'tor-browser':        'm1k1o/neko:tor-browser',
    'remmina':            'm1k1o/neko:remmina',
    'xfce':               'm1k1o/neko:xfce',
    'vlc':                'm1k1o/neko:vlc',
    'vncviewer':          'm1k1o/neko:vncviewer'
  }[imageName];

  if (!image) {
    throw 'Invalid image name';
  }
  return image;
}


export function genProvisionScript(options: ProvisionOptions,
  domain: string, subdomain: string, callbackIp: string,
  roomUsername: string, roomUserPw: string): string {
  const image = imageMap(options.image || 'firefox');
  const resp = options.resolution || '720p';
  const resolution = resp === '720p' ? '1280x720' : '1920x1080';
  const fps = options.fps || 30;
  const screen = `${resolution}@${fps}`;
  return `#!/bin/bash
set -e

URL=http://${callbackIp}
LOGIN_BODY='{ "name": "${roomUsername}", "pw": "${roomUserPw}" }'
TOKEN=$(curl --header "Content-Type: application/json" \\
  --request POST \\
  --data "$LOGIN_BODY" \\
  $URL/login | jq -r .token)

send_data () {
  BODY="{ \\"status\\": \\"$1\\", \\"step\\": $2 }"
  curl --header "Content-Type: application/json" \\
    --header "Authorization: Bearer $TOKEN" \\
    --request POST \\
    --data "$BODY" \\
    $URL/roomCallback
}

STEP=1
send_data 'script_started' $STEP

STEP=2
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
send_data 'nginx_configured' $STEP

STEP=3
certbot -n --nginx -d ${subdomain}.${domain} --agree-tos --register-unsafely-without-email \
  --redirect
send_data 'cert_installed' $STEP

STEP=4
cat > docker-compose.yaml <<EOF
version: "3.4"
services:
  neko:
    image: "${image}"
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
      NEKO_FILE_TRANSFER_ENABLED: "true"
EOF
docker-compose up -d
send_data 'ready' $STEP
`;
}

export default genProvisionScript;

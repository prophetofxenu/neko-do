packer {
  required_plugins {
    digitalocean = {
      version = ">= 1.0.0"
      source  = "github.com/hashicorp/digitalocean"
    }
  }
}

source "digitalocean" "ubuntu" {
  image = "ubuntu-20-04-x64"
  region = "nyc1"
  size = "s-1vcpu-1gb"
  ssh_username = "root"
  snapshot_name = "neko-do-img"
  tags = ["neko"]
}

build {
  name = "neko-do-ubuntu-img"
  sources = [
    "source.digitalocean.ubuntu"
  ]

  provisioner "shell" {
    inline = [
      "sleep 60",
      "apt-get -y update",
      "DEBIAN_FRONTEND=noninteractive apt-get -y upgrade",
      "apt-get -y install jq nginx ufw certbot python3-certbot-nginx docker.io docker-compose",

      "ufw allow 'Nginx HTTP'",
      "ufw allow 'Nginx HTTPS'",
      "ufw allow OpenSSH",
      "ufw --force enable",

      "docker pull m1k1o/neko:vivaldi",
      "docker pull m1k1o/neko:opera",
      "docker pull m1k1o/neko:ungoogled-chromium",
      "docker pull m1k1o/neko:microsoft-edge",
      "docker pull m1k1o/neko:brave",
      "docker pull m1k1o/neko:firefox",
      "docker pull m1k1o/neko:chromium",
      "docker pull m1k1o/neko:google-chrome",
      "docker pull m1k1o/neko:tor-browser",
      "docker pull m1k1o/neko:remmina",
      "docker pull m1k1o/neko:xfce",
      "docker pull m1k1o/neko:kde",
      "docker pull m1k1o/neko:vlc",
      "docker pull m1k1o/neko:vncviewer"
    ]
  } 
}

# neko-do

An Express API for creating instances of [n.eko](https://github.com/m1k1o/neko) on DigitalOcean.

* Client callbacks with status of an ongoing provision
* Preconfigured Packer image with n.eko images; provisioning completes in 3-5 minutes
* Domain registration with TLS through LetsEncrypt
* Automatic cleanup of a created room after two hours unless client extends the life of the room


## Requirements

* Docker
* Packer
* Postgres
* A DigitalOcean account, an API token, and an already created droplet to run this server.
* A domain setup with DigitalOcean.


## Setup

1. Create a new project named "neko" in the DigitalOcean control panel.

2. [Create a new SSH keypair and upload it to DigitalOcean](https://docs.digitalocean.com/products/droplets/how-to/add-ssh-keys/to-team/).
**This key can be used to SSH into the provisioned droplets, so keep it safe.** Afterwards, copy the
fingerprint from DigitalOcean for later use.

3. Create the Packer image. This will take several minutes. Afterwards, a snapshot named neko-do-img
will be in your DigitalOcean account.

```bash
cd packer
packer build .
```

* You may want to run this every week or so, as updates are installed during image generation. Make
sure to delete any existing images named neko-do-img to avoid conflicts.

4. Create the database and user in your Postgres server by logging in and running these commands.

```sql
CREATE DATABASE neko;
CREATE USER neko WITH ENCRYPTED PASSWORD '<your password here>';
GRANT ALL PRIVILEGES ON DATABASE neko TO neko;
```

5. Create a .env file with at least the following variables. See the section below for all
configuration options.

```env
DOMAIN=<your domain to create subdomains under>
DO_TOKEN=<your DigitalOcean API token>
DO_SSH_KEY_ID=<fingerprint of your SSH key>
PORT=8080
```

6. Run the project as a Docker container.

```bash
docker build . -t neko-do
docker run --env-file .env -p 8080:8080 neko-do
```


## Configuration options

* **DB_ADDR**: The address of your Postgres server. Defaults to 127.0.0.1.
* **DB_USER**: The user to login to the database as. Defaults to "neko". This user should have all
privileges on the database also named "neko".
* **DB_PW**: The password to login to the database with.
* **DO_TOKEN**: Your DigitalOcean API token.
* **DO_SSH_KEY_ID**: The fingerprint of your SSH key that you upload to DigitalOcean.
* **DO_PROJECT_NAME**: The name of the DigitalOcean project that resources will be created under, to
keep things organized.
* **DOMAIN**: The domain to create records for when creating rooms. Can be a subdomain, e.g.
neko.prophetofxenu.net.
* **CALLBACK_IP**: If you set this to the private IP address of the droplet running the server,
callbacks from provisioned rooms will be sent through the private network instead of the public Internet.
However, your server and the provisioned rooms must both be on the default VPC for the region you
create them in.

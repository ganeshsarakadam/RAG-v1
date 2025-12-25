#!/bin/bash

# Robust SSL Initialization Script (2-Stage)

if ! [ -x "$(command -v docker)" ]; then
  echo 'Error: docker is not installed.' >&2
  exit 1
fi

if [ -f .env ]; then
  export $(cat .env | grep -v '#' | awk '/=/ {print $1}')
fi

domains=(${DOMAIN_NAME})
email=${SSL_EMAIL}
data_path="./nginx/data/certbot"
staging=0

echo "### 1. Stopping Nginx ..."
docker compose -f docker-compose.prod.yml down nginx

echo "### 2. Backing up full Nginx config ..."
cp nginx/app.conf.template nginx/app.conf.template.bak

echo "### 3. Creating temp HTTP-only config ..."
cat > nginx/app.conf.template <<EOF
server {
    listen 80;
    server_name \${DOMAIN_NAME};
    server_tokens off;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF

echo "### 4. Starting Nginx (HTTP Mode) ..."
docker compose -f docker-compose.prod.yml up -d nginx
echo "Waiting for Nginx to be ready..."
sleep 10

echo "### 5. Requesting Let's Encrypt Certificate ..."

# Select appropriate email arg
case "$email" in
  "") email_arg="--register-unsafely-without-email" ;;
  *) email_arg="-m $email" ;;
esac

# Enable staging mode if needed
if [ $staging != "0" ]; then staging_arg="--staging"; fi

domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size 4096 \
    --agree-tos \
    --force-renewal" certbot

echo "### 6. Restoring full HTTPS config ..."
mv nginx/app.conf.template.bak nginx/app.conf.template

echo "### 7. Reloading Nginx (HTTPS Mode) ..."
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
# Force restart to pick up new ports/certs cleanly if reload is flaky
docker compose -f docker-compose.prod.yml restart nginx 

echo "### Done! SSL Setup Complete. ###"

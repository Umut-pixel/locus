cd /opt/locus-agent
git pull
cd agent
docker compose --project-name agent build
docker compose --project-name agent up -d
#!/usr/bin/env bash
set -euo pipefail

if ! docker info >/dev/null; then
  echo '无法连接 Docker，请检查 Docker 服务和当前用户权限。' >&2
  exit 1
fi

read -r -p '容器名称 [qingfeng-image-host]：' name
name=${name:-qingfeng-image-host}
if docker container inspect "$name" >/dev/null 2>&1; then
  echo "容器 $name 已存在。部署另一套时请选择其他名称。" >&2
  exit 1
fi

while true; do
  read -r -p '宿主机端口 [3000]：' port
  port=${port:-3000}
  if [[ $port =~ ^[1-9][0-9]{0,4}$ ]] && (( port <= 65535 )); then
    break
  fi
  echo '请输入 1 到 65535 之间的端口。'
done

read -r -p "宿主机数据目录 [/data/$name]：" storage
storage=${storage:-/data/$name}
if [[ $storage != /* || $storage == *:* ]]; then
  echo '请输入不含冒号的绝对路径。' >&2
  exit 1
fi

image=ghcr.io/sseven01/qingfeng-image-host:master
docker pull "$image"

if [[ ! -d $storage ]]; then
  if (( EUID == 0 )); then
    install -d -m 0755 -o 1001 -g 1001 -- "$storage"
  else
    sudo install -d -m 0755 -o 1001 -g 1001 -- "$storage"
  fi
fi

container=$(docker create --name "$name" --restart unless-stopped \
  -p "$port:3000" -v "$storage:/app/storage" "$image")
if ! docker start "$container" >/dev/null; then
  docker rm "$container" >/dev/null
  echo '启动失败。若端口已被占用，重新运行并选择空闲端口。' >&2
  exit 1
fi

printf '容器已启动。访问 http://服务器IP:%s\n' "$port"
printf '首次部署可运行 docker exec -it %s node cli.js password 设置后台密码（输入时不会显示字符，输入后按回车，再输入一次确认）。\n' "$name"

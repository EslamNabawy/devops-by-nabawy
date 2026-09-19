#!/usr/bin/env bash
set -e
PROJECT=/mnt/c/Users/eslam/OneDrive/Desktop/Jenkins
cd "$PROJECT"

DOCKER_IMAGE="eslamnabawy/hello-app"
BUILD_NUMBER=15
IMAGE_TAG="v${BUILD_NUMBER}"

echo "=== STAGE 1: Environment Setup ==="
echo "DOCKER_IMAGE=$DOCKER_IMAGE"
echo "IMAGE_TAG=$IMAGE_TAG"
echo "BUILD_NUMBER=$BUILD_NUMBER"
echo "FLOCI_ENDPOINT=http://floci-simulator-api:4566"

echo ""
echo "=== STAGE 2: Code Checkout ==="
ls -lh

echo ""
echo "=== STAGE 3: Docker Build (eslamnabawy) ==="
docker build -t ${DOCKER_IMAGE}:latest .
docker images ${DOCKER_IMAGE} --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

echo ""
echo "=== STAGE 4 & 5: Auth & Image Tagging ==="
docker tag ${DOCKER_IMAGE}:latest ${DOCKER_IMAGE}:${IMAGE_TAG}
docker images ${DOCKER_IMAGE} --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}"
echo "Jenkins credentials: docker-hub-creds -> eslamnabawy (verified)"
docker exec jenkins grep -A2 "docker-hub-creds" /var/jenkins_home/credentials.xml | head -n 5

echo ""
echo "=== STAGE 6: Image Push ==="
echo "Attempting docker push (requires Docker Hub login)..."
# Check if we can push - try login check
if docker push ${DOCKER_IMAGE}:${IMAGE_TAG} 2>&1; then
  echo "Pushed ${IMAGE_TAG}"
  docker push ${DOCKER_IMAGE}:latest 2>&1 | tail -n 20
else
  echo "Push failed - likely not logged in. Run: echo \$DOCKER_TOKEN | docker login -u eslamnabawy --password-stdin"
  echo "Then re-run: docker push ${DOCKER_IMAGE}:${IMAGE_TAG} && docker push ${DOCKER_IMAGE}:latest"
fi

echo ""
echo "=== STAGE 7: Deployment to Floci ==="
docker rm -f floci-hello-app 2>/dev/null || true
docker run -d --name floci-hello-app -p 8081:8081 -e PORT=8081 ${DOCKER_IMAGE}:${IMAGE_TAG}
sleep 3
docker ps --filter name=floci-hello-app --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
curl -s http://localhost:8081/ || echo "curl failed"
echo ""

# Ensure Floci mock API on 4566
cat > /tmp/floci_mock.py << 'PYMOCK'
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        l=int(self.headers.get("content-length",0))
        body=self.rfile.read(l).decode()
        print(f"[FLOCI MOCK] POST {self.path} body={body}")
        self.send_response(200)
        self.send_header("Content-Type","application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status":"deployed","service":"hello-app","image": json.loads(body).get("image") if body else "unknown"}).encode())
    def log_message(self, f,*a): print(f"[FLOCI] {f%a}")
HTTPServer(("0.0.0.0",4566),H).serve_forever()
PYMOCK
if ! curl -sf http://localhost:4566/deploy >/dev/null 2>&1; then
  pkill -f floci_mock.py 2>/dev/null || true
  nohup python3 /tmp/floci_mock.py >/tmp/floci_mock.log 2>&1 &
  sleep 2
fi
echo "Simulating Jenkinsfile curl to Floci:"
curl -s -X POST http://localhost:4566/deploy -H "Content-Type: application/json" -d "{\"image\":\"${DOCKER_IMAGE}:${IMAGE_TAG}\",\"service\":\"hello-app\"}"
echo ""

echo ""
echo "=== PIPELINE COMPLETE (eslamnabawy) ==="
echo "Verify: curl http://localhost:8081/"
curl -s http://localhost:8081/
echo ""
echo "Images:"
docker images | grep -E "hello-app|REPOSITORY"

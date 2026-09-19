#!/usr/bin/env bash
set -e
PROJECT=/mnt/c/Users/eslam/OneDrive/Desktop/Jenkins
cd "$PROJECT"

LOCAL_IMAGE="hello-app"
BUILD_NUMBER=14
IMAGE_TAG="v${BUILD_NUMBER}"

echo "=== STAGE 1: Environment Setup ==="
echo "DOCKER_IMAGE=eslamnabawy/hello-app (placeholder) / local: $LOCAL_IMAGE"
echo "IMAGE_TAG=$IMAGE_TAG"
echo "BUILD_NUMBER=$BUILD_NUMBER"
echo "FLOCI_ENDPOINT=http://floci-simulator-api:4566 (simulated locally)"

echo ""
echo "=== STAGE 2: Code Checkout ==="
echo "Simulating: checkout scm -> workspace:"
ls -lh

echo ""
echo "=== STAGE 3: Docker Build ==="
docker build -t ${LOCAL_IMAGE}:latest .
echo "--- image built ---"
docker images ${LOCAL_IMAGE} --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

echo ""
echo "=== STAGE 4 & 5: Auth & Image Tagging ==="
docker tag ${LOCAL_IMAGE}:latest ${LOCAL_IMAGE}:${IMAGE_TAG}
echo "Tagged: ${LOCAL_IMAGE}:${IMAGE_TAG}"
docker images ${LOCAL_IMAGE} --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}"

echo ""
echo "Simulating docker login (requires docker-hub-creds):"
echo "  Create in Jenkins: Manage Jenkins > Credentials > System > Global > Add Credentials"
echo "  Kind=Username with password, ID=docker-hub-creds, Username/Password=Docker Hub token"
echo "  Jenkinsfile uses: withCredentials([usernamePassword(credentialsId: 'docker-hub-creds', ...)])"

echo ""
echo "=== STAGE 6: Image Push (simulated) ==="
echo "Commands Jenkins would run (after docker login):"
echo "  docker push eslamnabawy/hello-app:${IMAGE_TAG}"
echo "  docker push eslamnabawy/hello-app:latest"
docker tag ${LOCAL_IMAGE}:latest eslamnabawy/hello-app:latest || true
docker tag ${LOCAL_IMAGE}:${IMAGE_TAG} eslamnabawy/hello-app:${IMAGE_TAG} || true
echo "Local Docker Hub placeholder tags created:"
docker images | grep hello-app || true

echo ""
echo "=== STAGE 7: Application Deployment (Floci) ==="
echo "Floci = AWS simulator at http://floci-simulator-api:4566"
echo "Locally simulating: docker run the built image"

docker rm -f floci-hello-app 2>/dev/null || true
docker run -d --name floci-hello-app -p 8081:8081 -e PORT=8081 ${LOCAL_IMAGE}:${IMAGE_TAG}
sleep 3
docker ps --filter name=floci-hello-app --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.Image}}"
echo "--- container logs ---"
docker logs floci-hello-app 2>&1 | head -n 20
echo "--- curl test (Floci health check) ---"
curl -s http://localhost:8081/ || echo "curl failed"
echo ""

# Floci mock API on 4566
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

# start mock if not running
if ! curl -sf http://localhost:4566/deploy >/dev/null 2>&1; then
  # kill old listener if any
  pkill -f floci_mock.py 2>/dev/null || true
  nohup python3 /tmp/floci_mock.py >/tmp/floci_mock.log 2>&1 &
  sleep 2
fi
echo "--- simulated Jenkinsfile curl to Floci ---"
curl -s -X POST http://localhost:4566/deploy -H "Content-Type: application/json" -d "{\"image\":\"eslamnabawy/hello-app:${IMAGE_TAG}\",\"service\":\"hello-app\"}"
echo ""
echo "--- Floci mock log ---"
cat /tmp/floci_mock.log 2>&1 | tail -n 20

echo ""
echo "=== POST: cleanup (docker logout simulation) ==="
echo "Jenkins post { always { sh 'docker logout' } }"
echo "Locally: not logging out to keep credentials"

echo ""
echo "=== PIPELINE COMPLETE ==="
echo "Verify: curl http://localhost:8081/"
curl -s http://localhost:8081/

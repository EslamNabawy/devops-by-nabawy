#!/usr/bin/env bash
set -e
PROJECT=/mnt/c/Users/eslam/OneDrive/Desktop/Jenkins
cd "$PROJECT"

# 1. Update Jenkinsfile to eslamnabawy
sed -i 's|your-dockerhub-username|eslamnabawy|g' Jenkinsfile
echo "=== Jenkinsfile updated ==="
grep DOCKER_IMAGE Jenkinsfile

# 2. Update run_pipeline.sh if exists
if [ -f run_pipeline.sh ]; then
  sed -i 's|your-dockerhub-username|eslamnabawy|g' run_pipeline.sh
  echo "run_pipeline.sh updated"
fi

cat Jenkinsfile

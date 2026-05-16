# infrastructure/kubernetes/

Plain Kubernetes manifests for Crypto Arena Survivors: Deployments, Services,
Ingress, ConfigMaps, Secrets templates, and HorizontalPodAutoscaler configs
for the client (static hosting + CDN origin) and the Go server (HTTP +
WebSocket). These are static YAML files, not Helm charts. The sandbox does
not have `kubectl` or `helm` installed, so the Makefile does not attempt to
apply them. Real implementation lands in FEAT-005.

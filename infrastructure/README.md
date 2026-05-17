# infrastructure/

Deployment and observability assets for Crypto Arena Survivors. Nothing in
this directory is applied automatically: Terraform and Kubernetes manifests
are checked in as static files for review and for use by the platform team.

Subdirectories:

- `terraform/` -- Terraform modules for the cloud accounts (GCP/Cloudflare),
  Kubernetes cluster, and DNS. Static `.tf` files, not run from CI.
- `kubernetes/` -- Plain Kubernetes manifests: Deployments, Services, Ingress,
  HPA configs for the client (static hosting) and the Go server.
- `monitoring/` -- Prometheus and Grafana manifests for metrics, alerts, and
  dashboards.

Real implementation lands in FEAT-005.

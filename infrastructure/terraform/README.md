# infrastructure/terraform/

Static Terraform modules for the Crypto Arena Survivors deployment: cloud
accounts (GCP/Cloudflare), the Kubernetes cluster, networking, and DNS.
These `.tf` files are checked in for review and platform-team use; they are
not applied from CI. The sandbox does not have `terraform` installed, so the
Makefile does not attempt to run `terraform init`/`plan`/`apply`. Real
implementation lands in FEAT-005.

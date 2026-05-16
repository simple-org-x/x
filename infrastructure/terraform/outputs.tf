output "cluster_name" {
  description = "Name of the EKS cluster."
  value       = local.cluster_name
}

output "cluster_endpoint" {
  description = "Kubernetes API endpoint."
  value       = try(module.eks.cluster_endpoint, null)
}

output "vpc_id" {
  description = "VPC the cluster runs in."
  value       = try(module.vpc.vpc_id, null)
}

output "private_subnet_ids" {
  description = "Private subnet IDs used by EKS node groups."
  value       = try(module.vpc.private_subnets, [])
}

output "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the project's apex domain."
  value       = try(data.cloudflare_zone.this.id, null)
}

output "client_fqdn" {
  description = "Public FQDN of the React/Phaser client."
  value       = "${var.client_subdomain}.${var.domain}"
}

output "api_fqdn" {
  description = "Public FQDN of the Go HTTP+WebSocket API."
  value       = "${var.api_subdomain}.${var.domain}"
}

###############################################################################
# Cloudflare DNS records pointing at the cluster ingress load balancer.
#
# The zone is looked up by name; both the client and API FQDNs become
# CNAMEs to the EKS-provisioned load balancer hostname (set in
# var.ingress_lb_hostname after the ingress controller comes up).
###############################################################################

data "cloudflare_zone" "this" {
  name = var.domain
}

resource "cloudflare_record" "client" {
  count = var.ingress_lb_hostname == null ? 0 : 1

  zone_id = data.cloudflare_zone.this.id
  name    = var.client_subdomain
  type    = "CNAME"
  value   = var.ingress_lb_hostname
  ttl     = 1
  proxied = true
  comment = "Crypto Arena Survivors web client (managed by terraform)"
}

resource "cloudflare_record" "api" {
  count = var.ingress_lb_hostname == null ? 0 : 1

  zone_id = data.cloudflare_zone.this.id
  name    = var.api_subdomain
  type    = "CNAME"
  value   = var.ingress_lb_hostname
  ttl     = 1
  proxied = true
  comment = "Crypto Arena Survivors HTTP+WS API (managed by terraform)"
}

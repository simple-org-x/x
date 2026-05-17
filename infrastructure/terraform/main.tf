###############################################################################
# Crypto Arena Survivors -- root Terraform module (template, not deployable).
#
# This file pins providers and is the entry point for the per-resource
# files in this directory:
#
#   variables.tf   inputs (region, project, domain, ...)
#   outputs.tf     things callers want exposed (cluster name, zone id, ...)
#   vpc.tf         AWS VPC + subnets
#   eks.tf         AWS EKS cluster + node group
#   cloudflare.tf  Cloudflare zone lookup + DNS records
#
# Every resource has placeholder defaults so `terraform validate` would
# pass without supplying real credentials. Do NOT `terraform apply` from
# this directory: it is a blueprint, not a plan.
###############################################################################

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

provider "cloudflare" {
  # api_token is read from the CLOUDFLARE_API_TOKEN env var.
}

# kubernetes/helm providers are lazily configured against the EKS
# cluster after eks.tf creates it.
provider "kubernetes" {
  host                   = try(module.eks.cluster_endpoint, "")
  cluster_ca_certificate = try(base64decode(module.eks.cluster_ca_certificate), "")
  token                  = try(data.aws_eks_cluster_auth.this[0].token, "")
}

provider "helm" {
  kubernetes {
    host                   = try(module.eks.cluster_endpoint, "")
    cluster_ca_certificate = try(base64decode(module.eks.cluster_ca_certificate), "")
    token                  = try(data.aws_eks_cluster_auth.this[0].token, "")
  }
}

data "aws_eks_cluster_auth" "this" {
  count = var.create_cluster ? 1 : 0
  name  = local.cluster_name
}

locals {
  cluster_name = "${var.project_name}-${var.environment}"
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

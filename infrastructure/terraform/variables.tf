variable "project_name" {
  description = "Short project identifier used as a name prefix on AWS resources."
  type        = string
  default     = "crypto-arena"
}

variable "environment" {
  description = "Deployment environment, e.g. dev, staging, prod."
  type        = string
  default     = "dev"
}

variable "region" {
  description = "AWS region for the VPC + EKS cluster."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR for the VPC. /16 leaves room for two AZ-pair subnets."
  type        = string
  default     = "10.42.0.0/16"
}

variable "azs" {
  description = "Availability zones to spread the cluster across."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "kubernetes_version" {
  description = "EKS control plane version."
  type        = string
  default     = "1.30"
}

variable "node_instance_types" {
  description = "EC2 instance types for the default node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_min_size" {
  description = "Minimum node count for the default group."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum node count for the default group."
  type        = number
  default     = 6
}

variable "node_desired_size" {
  description = "Desired starting node count."
  type        = number
  default     = 3
}

variable "domain" {
  description = "Apex domain managed by Cloudflare, e.g. crypto-arena.example.com."
  type        = string
  default     = "crypto-arena.example.com"
}

variable "client_subdomain" {
  description = "Subdomain that serves the React/Phaser client."
  type        = string
  default     = "play"
}

variable "api_subdomain" {
  description = "Subdomain that fronts the Go HTTP+WebSocket API."
  type        = string
  default     = "api"
}

variable "ingress_lb_hostname" {
  description = "Public hostname of the cluster ingress load balancer (set after the EKS LB is provisioned)."
  type        = string
  default     = null
}

variable "create_cluster" {
  description = "Toggle to skip cluster creation in template/plan-only contexts."
  type        = bool
  default     = false
}

# infrastructure/monitoring/

Prometheus and Grafana manifests for Crypto Arena Survivors observability:
ServiceMonitor / PodMonitor specs, alerting rules, and Grafana dashboards
covering matchmaking latency, game-loop tick health, WebSocket connection
counts, and reward payout pipeline metrics. Real implementation lands in
FEAT-005.

"""
Network monitor stub.

Placeholder for the network-monitoring subsystem that will
provide visible proof that no external API calls are being made
during air-gapped operation.

Not implemented in this foundation phase.
"""


class NetworkMonitor:
    """
    Monitors outbound network activity to prove air-gap compliance.

    Future implementation will hook into OS-level socket monitoring
    or eBPF-based tracing to detect and block any external calls.
    """

    def check_compliance(self) -> dict[str, object]:
        """Return current network compliance status."""
        return {
            "status": "not_implemented",
            "outbound_connections": [],
            "note": "Network monitoring will be implemented in a future phase.",
        }

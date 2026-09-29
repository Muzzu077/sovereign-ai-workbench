"""
Network monitor.

Verifies air-gap compliance by checking that the application's
configured endpoints are loopback-only.  This is a verification
layer, not an OS-level network filter.

Architecture:
- Validates all configured URLs at check time against the
  loopback allowlist (same _LOCAL_HOSTS as LlamaCppProvider).
- Reports any non-loopback endpoints as violations.
- Does NOT perform OS-level socket monitoring (that requires
  eBPF or iptables, out of scope for v0.6.1).

The NetworkMonitor is intended to be called at startup and
exposed via the health endpoint to give operators visible
proof that no external endpoints are configured.
"""

import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Hostnames / IPs that are considered local-only.
# Must stay in sync with LlamaCppProvider._LOCAL_HOSTS.
_LOCAL_HOSTS = frozenset({
    "localhost",
    "127.0.0.1",
    "::1",
    "0.0.0.0",
})


def is_loopback_url(url: str) -> bool:
    """Check if a URL points to a loopback address.

    Args:
        url: Full URL to validate.

    Returns:
        True if the host component is in the loopback allowlist.
    """
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        return host in _LOCAL_HOSTS
    except Exception:
        return False


class NetworkMonitor:
    """
    Verifies air-gap compliance by validating configured endpoints.

    At construction time, records the set of endpoints that the
    application is configured to communicate with.  The
    ``check_compliance()`` method validates each against the
    loopback allowlist and reports violations.

    This is a *configuration verification* layer.  It does NOT
    intercept or block actual network traffic at the OS level.
    OS-level enforcement (eBPF / iptables) is planned for a
    future phase.
    """

    def __init__(
        self,
        configured_endpoints: dict[str, str] | None = None,
    ) -> None:
        """
        Args:
            configured_endpoints: Mapping of endpoint names to URLs,
                e.g. {"llm_server": "http://127.0.0.1:8080"}.
        """
        self._endpoints: dict[str, str] = configured_endpoints or {}

    def check_compliance(self) -> dict[str, object]:
        """Return current network compliance status.

        Returns a dict with:
        - status: "compliant", "non_compliant", or "no_endpoints"
        - endpoints: list of dicts, each with name/url/is_loopback
        - violations: list of endpoint names pointing to non-loopback URLs
        - note: human-readable explanation
        """
        if not self._endpoints:
            return {
                "status": "no_endpoints",
                "endpoints": [],
                "violations": [],
                "note": (
                    "No endpoints configured for monitoring. "
                    "Air-gap compliance cannot be verified."
                ),
            }

        endpoint_results = []
        violations = []

        for name, url in self._endpoints.items():
            loopback = is_loopback_url(url)
            endpoint_results.append({
                "name": name,
                "url": url,
                "is_loopback": loopback,
            })
            if not loopback:
                violations.append(name)
                logger.warning(
                    "Air-gap violation: endpoint '%s' points to "
                    "non-loopback URL '%s'",
                    name,
                    url,
                )

        status = "compliant" if not violations else "non_compliant"

        return {
            "status": status,
            "endpoints": endpoint_results,
            "violations": violations,
            "note": (
                "All configured endpoints are loopback-only."
                if not violations
                else (
                    f"{len(violations)} endpoint(s) point to non-loopback "
                    f"addresses: {', '.join(violations)}. "
                    f"Air-gap compliance is NOT verified."
                )
            ),
        }

"""
Verification layer.

Provides independent verification of tool results where possible.
Each verifier returns one of:

    PASS           — result independently confirmed correct
    FAIL           — result independently confirmed incorrect
    NOT_VERIFIED   — no verifier exists for this tool/result type

The system must never claim verification where no verifier exists.
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any

from pydantic import BaseModel

from app.tools.base import ToolResult


class VerificationStatus(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    NOT_VERIFIED = "NOT_VERIFIED"


class VerificationResult(BaseModel):
    """Outcome of a verification check."""

    status: VerificationStatus
    tool_name: str
    detail: str = ""


class Verifier(ABC):
    """Abstract verifier for a specific tool type."""

    @property
    @abstractmethod
    def tool_name(self) -> str:
        """Name of the tool this verifier covers."""
        ...

    @abstractmethod
    def verify(
        self, tool_input: dict[str, Any], tool_result: ToolResult
    ) -> VerificationResult:
        """Verify a tool result.

        Args:
            tool_input:  The input that was passed to the tool.
            tool_result: The result the tool returned.

        Returns:
            VerificationResult with PASS, FAIL, or NOT_VERIFIED.
        """
        ...


class CalculatorVerifier(Verifier):
    """Independently re-computes the arithmetic expression and
    compares against the tool's reported result."""

    @property
    def tool_name(self) -> str:
        return "calculator"

    def verify(
        self, tool_input: dict[str, Any], tool_result: ToolResult
    ) -> VerificationResult:
        if not tool_result.success:
            # Cannot verify a failed computation.
            return VerificationResult(
                status=VerificationStatus.NOT_VERIFIED,
                tool_name=self.tool_name,
                detail=f"Tool returned error: {tool_result.error}",
            )

        expression = tool_input.get("expression", "")
        if not expression:
            return VerificationResult(
                status=VerificationStatus.NOT_VERIFIED,
                tool_name=self.tool_name,
                detail="No expression in input to verify against.",
            )

        # Re-evaluate using the same safe calculator.
        from app.tools.calculator import CalculatorTool

        verifier_calc = CalculatorTool()
        check = verifier_calc.execute({"expression": expression})

        if not check.success:
            return VerificationResult(
                status=VerificationStatus.NOT_VERIFIED,
                tool_name=self.tool_name,
                detail=f"Verification re-computation failed: {check.error}",
            )

        if check.result == tool_result.result:
            return VerificationResult(
                status=VerificationStatus.PASS,
                tool_name=self.tool_name,
                detail=f"Result {tool_result.result} independently confirmed.",
            )

        return VerificationResult(
            status=VerificationStatus.FAIL,
            tool_name=self.tool_name,
            detail=(
                f"Mismatch: tool returned {tool_result.result}, "
                f"verification computed {check.result}."
            ),
        )


class VerifierRegistry:
    """Registry mapping tool names to their verifiers."""

    def __init__(self) -> None:
        self._verifiers: dict[str, Verifier] = {}

    def register(self, verifier: Verifier) -> None:
        self._verifiers[verifier.tool_name] = verifier

    def verify(
        self, tool_name: str, tool_input: dict[str, Any], tool_result: ToolResult
    ) -> VerificationResult:
        """Verify a tool result, or return NOT_VERIFIED if no verifier exists."""
        verifier = self._verifiers.get(tool_name)
        if verifier is None:
            return VerificationResult(
                status=VerificationStatus.NOT_VERIFIED,
                tool_name=tool_name,
                detail=f"No verifier registered for tool '{tool_name}'.",
            )
        return verifier.verify(tool_input, tool_result)

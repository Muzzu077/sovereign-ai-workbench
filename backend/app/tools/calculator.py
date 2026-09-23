"""
Safe calculator tool.

Evaluates arithmetic expressions without using ``eval()``,
``exec()``, or any shell/Python execution. Supports:

    +  -  *  /  //  %  **  ()

Rejects any expression containing function calls, imports,
identifiers (other than numeric literals), or unsafe constructs.
"""

import ast
import operator
import math
from typing import Any

from app.tools.base import Tool, ToolResult


# Operators allowed in expressions.
_SAFE_OPERATORS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}

# Maximum exponent to prevent denial-of-service via huge powers.
_MAX_EXPONENT = 1000


class CalculatorTool(Tool):
    """Safe arithmetic calculator.

    Parses the expression into an AST and evaluates only
    numeric literals and whitelisted operators. Never calls
    ``eval()`` or ``exec()``.
    """

    @property
    def name(self) -> str:
        return "calculator"

    @property
    def description(self) -> str:
        return (
            "Evaluate a safe arithmetic expression. "
            "Supports +, -, *, /, //, %, ** and parentheses. "
            "No variables, functions, or code execution."
        )

    @property
    def input_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "Arithmetic expression to evaluate, e.g. '125 * 37'",
                }
            },
            "required": ["expression"],
        }

    def execute(self, tool_input: dict[str, Any]) -> ToolResult:
        """Evaluate the arithmetic expression safely."""
        expression = tool_input.get("expression", "")
        if not isinstance(expression, str) or not expression.strip():
            return ToolResult(
                success=False,
                error="Expression must be a non-empty string.",
            )

        expression = expression.strip()

        try:
            tree = ast.parse(expression, mode="eval")
        except SyntaxError as exc:
            return ToolResult(
                success=False,
                error=f"Invalid expression syntax: {exc}",
            )

        try:
            value = self._eval_node(tree.body)
        except (ValueError, TypeError, ZeroDivisionError, OverflowError) as exc:
            return ToolResult(
                success=False,
                error=str(exc),
            )

        # Normalize the result
        if isinstance(value, float) and value == int(value) and math.isfinite(value):
            value = int(value)

        return ToolResult(
            success=True,
            result=value,
            metadata={"expression": expression},
        )

    # ----------------------------------------------------------------- AST walker

    def _eval_node(self, node: ast.AST) -> int | float:
        """Recursively evaluate a safe AST node."""
        if isinstance(node, ast.Expression):
            return self._eval_node(node.body)

        if isinstance(node, ast.Constant):
            if isinstance(node.value, (int, float)):
                return node.value
            raise ValueError(
                f"Unsupported constant type: {type(node.value).__name__}. "
                "Only numeric values are allowed."
            )

        if isinstance(node, ast.UnaryOp):
            op_fn = _SAFE_OPERATORS.get(type(node.op))
            if op_fn is None:
                raise ValueError(f"Unsupported unary operator: {type(node.op).__name__}")
            operand = self._eval_node(node.operand)
            return op_fn(operand)

        if isinstance(node, ast.BinOp):
            op_fn = _SAFE_OPERATORS.get(type(node.op))
            if op_fn is None:
                raise ValueError(f"Unsupported operator: {type(node.op).__name__}")
            left = self._eval_node(node.left)
            right = self._eval_node(node.right)

            # Guard against huge exponents.
            if isinstance(node.op, ast.Pow):
                if isinstance(right, (int, float)) and abs(right) > _MAX_EXPONENT:
                    raise ValueError(
                        f"Exponent too large: {right}. Maximum allowed: {_MAX_EXPONENT}."
                    )

            result = op_fn(left, right)

            if isinstance(result, float) and not math.isfinite(result):
                raise OverflowError("Result is not finite (overflow or division by zero).")

            return result

        # Anything else is not allowed.
        raise ValueError(
            f"Unsafe expression element: {type(node).__name__}. "
            "Only numeric literals and arithmetic operators are permitted."
        )

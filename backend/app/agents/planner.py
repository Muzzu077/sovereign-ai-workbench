"""
Task planner stub.

Will be responsible for decomposing complex tasks into
ordered sub-steps for the orchestrator to execute.

Not implemented in the foundation phase.
"""


class TaskPlanner:
    """
    Decomposes a high-level task into an ordered plan of sub-tasks.

    Future implementation will use an LLM to produce a structured
    execution plan that the orchestrator iterates over.
    """

    def plan(self, task: str) -> list[str]:
        """
        Break a task into sub-steps.

        Currently returns the task as a single step (no planning).
        """
        return [task]

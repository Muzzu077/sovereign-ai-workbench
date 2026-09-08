"""
Task router stub.

Will be responsible for analyzing a task and selecting the most
appropriate model category (general, coding, vision, etc.).

Not implemented in the foundation phase — the orchestrator
currently defaults to the 'general' model.
"""


class TaskRouter:
    """
    Determines which model category should handle a given task.

    Future implementation will inspect task content (keywords,
    attached files, modality) to pick the best model.
    """

    def route(self, task: str) -> str:
        """
        Return the model category name for the given task.

        Currently always returns 'general'.
        """
        return "general"

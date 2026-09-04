from enum import StrEnum


class ContentStatus(StrEnum):
    IDEA = "IDEA"
    SELECTED = "SELECTED"
    BRIEF_READY = "BRIEF_READY"
    DRAFT_READY = "DRAFT_READY"
    FACT_CHECK = "FACT_CHECK"
    REVIEW = "REVIEW"
    APPROVED = "APPROVED"
    SCHEDULED = "SCHEDULED"
    PUBLISHING = "PUBLISHING"
    PUBLISHED = "PUBLISHED"
    ANALYZED = "ANALYZED"


_ALLOWED: dict[ContentStatus, set[ContentStatus]] = {
    ContentStatus.IDEA: {ContentStatus.SELECTED},
    ContentStatus.SELECTED: {ContentStatus.BRIEF_READY, ContentStatus.IDEA},
    ContentStatus.BRIEF_READY: {ContentStatus.DRAFT_READY, ContentStatus.SELECTED},
    ContentStatus.DRAFT_READY: {ContentStatus.FACT_CHECK, ContentStatus.REVIEW, ContentStatus.BRIEF_READY},
    ContentStatus.FACT_CHECK: {ContentStatus.REVIEW, ContentStatus.DRAFT_READY},
    ContentStatus.REVIEW: {ContentStatus.APPROVED, ContentStatus.DRAFT_READY},
    ContentStatus.APPROVED: {ContentStatus.SCHEDULED, ContentStatus.REVIEW},
    ContentStatus.SCHEDULED: {ContentStatus.PUBLISHING, ContentStatus.APPROVED},
    ContentStatus.PUBLISHING: {ContentStatus.PUBLISHED, ContentStatus.SCHEDULED},
    ContentStatus.PUBLISHED: {ContentStatus.ANALYZED},
    ContentStatus.ANALYZED: set(),
}


def can_transition(current: str | ContentStatus, target: str | ContentStatus) -> bool:
    current_status = ContentStatus(current)
    target_status = ContentStatus(target)
    if current_status == target_status:
        return True
    return target_status in _ALLOWED[current_status]


def require_transition(current: str | ContentStatus, target: str | ContentStatus) -> None:
    if not can_transition(current, target):
        raise ValueError(f"Invalid content status transition: {current} -> {target}")

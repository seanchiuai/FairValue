from __future__ import annotations

from abc import ABC, abstractmethod

from sf_scraper.models import Listing


class SourceAdapter(ABC):
    source_name: str
    minimum_expected_count: int = 1

    @abstractmethod
    def fetch(self) -> list[Listing]:
        raise NotImplementedError

"""SS-075: spoken-only matching is the default and is switched by a setting."""

from __future__ import annotations

import pytest
from engine.matching import orchestrator as orch_mod
from engine.matching.orchestrator import PipelineOrchestrator, setting_as_bool


class _Store:
    def __init__(self, stored=None):
        self.stored = dict(stored or {})

    def set_setting(self, k, v):
        self.stored[k] = v

    def get_setting(self, k, default=None):
        return self.stored.get(k, default)


@pytest.fixture
def live_orchestrator():
    orch = orch_mod.get_orchestrator()
    before = orch.spoken_only
    yield orch
    orch.spoken_only = before


def test_spoken_only_is_the_default():
    assert PipelineOrchestrator().spoken_only is True
    assert orch_mod.get_orchestrator().spoken_only is True


@pytest.mark.parametrize(
    ("value", "expected"),
    [(True, True), (False, False), ("false", False), ("0", False), ("off", False),
     ("true", True), (1, True), (0, False)],
)
def test_setting_as_bool(value, expected):
    assert setting_as_bool(value) is expected


def test_settings_put_toggles_the_live_orchestrator(monkeypatch, live_orchestrator):
    from api import settings as api

    store = _Store()
    monkeypatch.setattr(api, "get_store", lambda: store)
    api.put_setting(api.SettingUpdate(key="matching.spoken_only", value=False))
    assert live_orchestrator.spoken_only is False
    assert store.stored == {"matching.spoken_only": False}
    api.put_setting(api.SettingUpdate(key="matching.spoken_only", value=True))
    assert live_orchestrator.spoken_only is True


def test_unrelated_setting_leaves_mode_alone(monkeypatch, live_orchestrator):
    from api import settings as api

    monkeypatch.setattr(api, "get_store", lambda: _Store())
    api.put_setting(api.SettingUpdate(key="vad_sensitivity", value=0.2))
    assert live_orchestrator.spoken_only is True


def test_apply_persisted_restores_the_setting(monkeypatch, live_orchestrator):
    from engine.config import store as store_mod

    monkeypatch.setattr(store_mod, "get_store", lambda: _Store({"matching.spoken_only": False}))
    orch_mod.apply_persisted_spoken_only()
    assert live_orchestrator.spoken_only is False

    monkeypatch.setattr(store_mod, "get_store", lambda: _Store())
    orch_mod.apply_persisted_spoken_only()
    assert live_orchestrator.spoken_only is True


def test_apply_persisted_keeps_spoken_only_when_the_store_fails(monkeypatch, live_orchestrator):
    from engine.config import store as store_mod

    def broken():
        raise RuntimeError("app.db unavailable")

    live_orchestrator.spoken_only = False
    monkeypatch.setattr(store_mod, "get_store", broken)
    orch_mod.apply_persisted_spoken_only()
    assert live_orchestrator.spoken_only is True

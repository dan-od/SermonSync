"""Unit tests for presets/units/settings persistence (SS-043 / SS-046 / SS-051)."""

from __future__ import annotations

import pytest
from engine.config.store import DEFAULT_PRESETS, ConfigStore


@pytest.fixture
def store(tmp_path):
    return ConfigStore(db_path=str(tmp_path / "app.db"))


# --- Presets (SS-043) ---------------------------------------------------
def test_seeds_default_presets(store):
    presets = store.list_presets()
    assert len(presets) == len(DEFAULT_PRESETS)
    assert presets[0]["reference"] == "Romans 8:28"


def test_add_update_delete_preset(store):
    p = store.add_preset("Acts 1:8", label="Power")
    assert p["reference"] == "Acts 1:8"
    updated = store.update_preset(p["id"], reference="Acts 2:38")
    assert updated["reference"] == "Acts 2:38"
    assert store.delete_preset(p["id"]) is True
    assert store.delete_preset(p["id"]) is False


def test_reorder_presets(store):
    presets = store.list_presets()
    ids = [p["id"] for p in presets]
    store.reorder_presets(list(reversed(ids)))
    reordered = store.list_presets()
    assert [p["id"] for p in reordered] == list(reversed(ids))


def test_presets_persist_across_instances(tmp_path):
    path = str(tmp_path / "app.db")
    ConfigStore(db_path=path).add_preset("Custom 1:1")
    again = ConfigStore(db_path=path, seed_defaults=False).list_presets()
    assert any(p["reference"] == "Custom 1:1" for p in again)


# --- Units (SS-046) -----------------------------------------------------
def test_default_unit_active(store):
    active = store.active_unit()
    assert active["id"] == "FSQ-PH-MGBUOGBA-01"


def test_upsert_and_activate_unit(store):
    store.upsert_unit("FSQ-LAG-01", "Lagos Central")
    assert any(u["id"] == "FSQ-LAG-01" for u in store.list_units())
    store.set_active_unit("FSQ-LAG-01")
    assert store.active_unit()["id"] == "FSQ-LAG-01"
    # only one active at a time
    assert sum(1 for u in store.list_units() if u["is_active"]) == 1


def test_activate_unknown_unit_raises(store):
    with pytest.raises(ValueError):
        store.set_active_unit("does-not-exist")


# --- Settings KV (SS-051 persistence) -----------------------------------
def test_settings_roundtrip_and_persist(tmp_path):
    path = str(tmp_path / "app.db")
    s1 = ConfigStore(db_path=path)
    s1.set_setting("theme", "midnight")
    s1.set_setting("vad_sensitivity", 0.7)
    s2 = ConfigStore(db_path=path, seed_defaults=False)
    assert s2.get_setting("theme") == "midnight"
    assert s2.get_setting("vad_sensitivity") == 0.7
    assert s2.get_setting("missing", "fallback") == "fallback"
    assert set(s2.all_settings()) == {"theme", "vad_sensitivity"}

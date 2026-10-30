"""Synthetic electricity-distribution network inspired by Mumbai.

Every asset, vendor, advisory, address and event in this module is fictional. The
coordinates point at real neighbourhoods so the map reads naturally, but nothing here
describes real infrastructure. The dataset follows the 45-asset layout proposed in the
INFRAWATCH blueprint (control centre, 5 substations, 12 transformers, 3 SCADA servers,
8 gateways, 8 PLCs/RTUs, 3 engineering workstations, 5 switches) plus the distribution
zones, critical facilities and untrusted entry points the risk engine reasons about.
"""

from __future__ import annotations

import math
from copy import deepcopy

SITES: dict[str, dict] = {
    "CC": {"name": "Regional Control Centre — BKC", "lat": 19.0657, "lon": 72.8655},
    "DR": {"name": "Disaster Recovery Site — Powai", "lat": 19.1187, "lon": 72.9046},
    "SUB-A": {"name": "Dadar", "lat": 19.0186, "lon": 72.8428},
    "SUB-B": {"name": "Andheri East", "lat": 19.1146, "lon": 72.8716},
    "SUB-C": {"name": "Kurla", "lat": 19.0705, "lon": 72.8857},
    "SUB-D": {"name": "Worli", "lat": 19.0089, "lon": 72.8168},
    "SUB-E": {"name": "Ghatkopar", "lat": 19.0866, "lon": 72.9095},
}

# Cyber assets sit in a small ring around their site so they stay distinguishable on the map.
_RING: dict[str, list[str]] = {
    "CC": ["SCADA-001", "SCADA-003", "GW-006", "GW-007", "ENG-001", "ENG-003", "SW-001", "SW-002"],
    "DR": ["SCADA-002"],
    "SUB-A": ["GW-001", "RTU-001", "PLC-001", "ENG-002", "SW-003"],
    "SUB-B": ["GW-002", "RTU-002", "SW-004"],
    "SUB-C": ["GW-003", "RTU-003", "PLC-002"],
    "SUB-D": ["GW-004", "RTU-004", "SW-005"],
    "SUB-E": ["GW-005", "RTU-005", "GW-008", "PLC-003"],
}


def _ring_position(site: str, asset_id: str) -> tuple[float, float]:
    members = _RING[site]
    idx = members.index(asset_id)
    base = SITES[site]
    if len(members) == 1:
        return base["lat"] + 0.0012, base["lon"] + 0.0012
    angle = 2 * math.pi * idx / len(members) + 0.6
    radius = 0.0019 if site == "CC" else 0.0015
    return round(base["lat"] + radius * math.sin(angle), 6), round(base["lon"] + radius * math.cos(angle), 6)


def _sw(vendor: str, product: str, version: str, kind: str = "firmware") -> dict:
    return {"vendor": vendor, "product": product, "version": version, "kind": kind}


def _cyber(
    asset_id: str,
    name: str,
    type_: str,
    site: str,
    *,
    zone: str,
    purdue: float,
    criticality: int,
    redundancy: str,
    exposure: str,
    auth: str,
    monitoring: float,
    software: list[dict],
    ip: str,
    recovery_hours: float,
    description: str,
    internet_facing: bool = False,
    remote_access: bool = False,
    owner: str = "OT Security",
    tags: list[str] | None = None,
) -> dict:
    lat, lon = _ring_position(site, asset_id)
    primary = software[0] if software else {}
    return {
        "id": asset_id,
        "name": name,
        "type": type_,
        "category": "cyber",
        "site": site,
        "site_name": SITES[site]["name"],
        "lat": lat,
        "lon": lon,
        "zone": zone,
        "purdue_level": purdue,
        "criticality": criticality,
        "redundancy": redundancy,
        "exposure": exposure,
        "auth": auth,
        "monitoring": monitoring,
        "internet_facing": internet_facing,
        "remote_access": remote_access,
        "vendor": primary.get("vendor"),
        "model": primary.get("product"),
        "software": software,
        "ip": ip,
        "recovery_hours": recovery_hours,
        "status": "active",
        "owner": owner,
        "description": description,
        "tags": tags or [],
        "last_assessment": "2026-10-30",
    }


def _physical(
    asset_id: str,
    name: str,
    type_: str,
    site: str,
    lat: float,
    lon: float,
    *,
    criticality: int,
    redundancy: str,
    recovery_hours: float,
    description: str,
    rating: str | None = None,
    backup_hours: float = 0.0,
) -> dict:
    return {
        "id": asset_id,
        "name": name,
        "type": type_,
        "category": "physical",
        "site": site,
        "site_name": SITES[site]["name"] if site in SITES else site,
        "lat": lat,
        "lon": lon,
        "zone": "process",
        "purdue_level": 0,
        "criticality": criticality,
        "redundancy": redundancy,
        "exposure": "isolated",
        "auth": "n/a",
        "monitoring": 0.0,
        "internet_facing": False,
        "remote_access": False,
        "vendor": None,
        "model": rating,
        "software": [],
        "ip": None,
        "recovery_hours": recovery_hours,
        "backup_hours": backup_hours,
        "status": "active",
        "owner": "Grid Operations",
        "description": description,
        "tags": [],
        "last_assessment": "2026-10-30",
    }


def _zone(asset_id: str, name: str, lat: float, lon: float, population: int, peak_mw: int, radius: float, seed: int) -> dict:
    # A jittered heptagon is enough to read as a service territory on the map.
    polygon = []
    for k in range(7):
        a = 2 * math.pi * k / 7 + seed * 0.37
        jitter = 0.78 + 0.22 * math.sin(seed * 1.7 + k * 2.3)
        polygon.append([round(lon + radius * jitter * math.cos(a) * 1.06, 6), round(lat + radius * jitter * math.sin(a), 6)])
    polygon.append(polygon[0])
    return {
        "id": asset_id,
        "name": name,
        "type": "zone",
        "category": "service",
        "site": None,
        "lat": lat,
        "lon": lon,
        "zone": "service",
        "purdue_level": None,
        "criticality": 4,
        "redundancy": "n/a",
        "population": population,
        "peak_mw": peak_mw,
        "customers": int(population / 4.1),
        "polygon": polygon,
        "status": "active",
        "description": f"Distribution zone serving roughly {population:,} residents (synthetic).",
        "tags": [],
    }


def _facility(
    asset_id: str,
    name: str,
    facility_type: str,
    lat: float,
    lon: float,
    *,
    population: int,
    backup_hours: float,
    criticality: int,
    description: str,
    beds: int | None = None,
) -> dict:
    return {
        "id": asset_id,
        "name": name,
        "type": "facility",
        "facility_type": facility_type,
        "category": "service",
        "site": None,
        "lat": lat,
        "lon": lon,
        "zone": "service",
        "purdue_level": None,
        "criticality": criticality,
        "redundancy": "n/a",
        "population": population,
        "backup_hours": backup_hours,
        "beds": beds,
        "essential": True,
        "status": "active",
        "description": description,
        "tags": ["essential-service"],
    }


def _entry(asset_id: str, name: str, zone: str, purdue: float, description: str) -> dict:
    return {
        "id": asset_id,
        "name": name,
        "type": "entry",
        "category": "entry",
        "site": None,
        "lat": None,
        "lon": None,
        "zone": zone,
        "purdue_level": purdue,
        "criticality": 0,
        "redundancy": "n/a",
        "exposure": "exposed",
        "status": "active",
        "description": description,
        "tags": ["untrusted"],
    }


VOLTARA, ARCWAVE, TARSIER = "Voltara Systems", "Arcwave", "Tarsier Telecom"
KESTREL, MERIDIAN, CORVID, HALDEN = "Kestrel Automation", "Meridian Controls", "Corvid Systems", "Halden Networks"


def _assets() -> list[dict]:
    assets: list[dict] = [
        _entry("EXT-INTERNET", "Public Internet", "internet", 5, "Untrusted public network. Origin point for attack-path analysis."),
        _entry("CORP-IT", "Corporate IT Network", "corporate", 4, "Enterprise office network: email, ERP, staff laptops."),
        _entry("VENDOR-NET", "Vendor Support Network", "vendor", 5, "Third-party integrator network used for remote maintenance."),
        # Control centre and substations
        _physical("CC-001", "Regional Control Centre — BKC", "control_centre", "CC", SITES["CC"]["lat"], SITES["CC"]["lon"],
                  criticality=5, redundancy="medium", recovery_hours=72, backup_hours=24,
                  description="Supervises distribution operations for all five substations. Hosts the primary SCADA, historian and IT/OT boundary."),
        _physical("SUB-A", "Central Distribution Substation A — Dadar", "substation", "SUB-A", SITES["SUB-A"]["lat"], SITES["SUB-A"]["lon"],
                  criticality=5, redundancy="low", recovery_hours=48, rating="33/11 kV · 3 × 20 MVA",
                  description="Feeds Dadar–Parel, the City General Hospital feeder and the suburban rail signalling hub."),
        _physical("SUB-B", "Distribution Substation B — Andheri East", "substation", "SUB-B", SITES["SUB-B"]["lat"], SITES["SUB-B"]["lon"],
                  criticality=4, redundancy="medium", recovery_hours=36, rating="33/11 kV · 2 × 25 MVA",
                  description="Serves Andheri and the Western Suburbs Hospital."),
        _physical("SUB-C", "Distribution Substation C — Kurla", "substation", "SUB-C", SITES["SUB-C"]["lat"], SITES["SUB-C"]["lon"],
                  criticality=4, redundancy="medium", recovery_hours=36, rating="33/11 kV · 3 × 16 MVA",
                  description="Serves Kurla, BKC and Water Pumping Station B."),
        _physical("SUB-D", "Distribution Substation D — Worli", "substation", "SUB-D", SITES["SUB-D"]["lat"], SITES["SUB-D"]["lon"],
                  criticality=4, redundancy="low", recovery_hours=40, rating="33/11 kV · 2 × 20 MVA",
                  description="Serves Worli–Lower Parel and the dedicated feeder to the Worli telecom exchange."),
        _physical("SUB-E", "Distribution Substation E — Ghatkopar", "substation", "SUB-E", SITES["SUB-E"]["lat"], SITES["SUB-E"]["lon"],
                  criticality=3, redundancy="medium", recovery_hours=30, rating="33/11 kV · 2 × 16 MVA",
                  description="Serves Ghatkopar and the Eastern Trauma Centre."),
    ]

    transformers = [
        ("TX-A1", "SUB-A", 19.0150, 72.8435, 4, "medium", "Zone A primary transformer (20 MVA)."),
        ("TX-A2", "SUB-A", 19.0215, 72.8390, 4, "medium", "Zone A standby and Worli tie-line transformer (20 MVA)."),
        ("TX-A3", "SUB-A", 19.0105, 72.8410, 5, "low", "Hospital Feeder 01: dedicated supply to City General Hospital and the rail signalling hub."),
        ("TX-B1", "SUB-B", 19.1170, 72.8650, 4, "medium", "Zone B primary transformer (25 MVA)."),
        ("TX-B2", "SUB-B", 19.1200, 72.8580, 3, "medium", "Zone B standby transformer (25 MVA)."),
        ("TX-C1", "SUB-C", 19.0735, 72.8840, 4, "medium", "Zone C primary transformer (16 MVA)."),
        ("TX-C2", "SUB-C", 19.0680, 72.8900, 4, "low", "Water Pumping Station B feeder and Zone C standby (16 MVA)."),
        ("TX-C3", "SUB-C", 19.0650, 72.8790, 4, "low", "BKC feeder supplying Zone F and the control centre (16 MVA)."),
        ("TX-D1", "SUB-D", 19.0060, 72.8200, 4, "low", "Zone D primary transformer (20 MVA)."),
        ("TX-D2", "SUB-D", 19.0100, 72.8135, 4, "low", "Dedicated feeder to the Worli telecom exchange (20 MVA)."),
        ("TX-E1", "SUB-E", 19.0840, 72.9100, 3, "medium", "Zone E primary transformer and trauma-centre supply (16 MVA)."),
        ("TX-E2", "SUB-E", 19.0890, 72.9140, 3, "medium", "Zone E standby transformer (16 MVA)."),
    ]
    for tid, site, lat, lon, crit, red, desc in transformers:
        assets.append(_physical(tid, f"Transformer {tid}", "transformer", site, lat, lon, criticality=crit,
                                redundancy=red, recovery_hours=96 if crit >= 5 else 72, rating="33/11 kV", description=desc))

    assets += [
        # SCADA
        _cyber("SCADA-001", "Primary SCADA Server", "scada", "CC", zone="supervisory", purdue=3, criticality=5, redundancy="medium",
               exposure="internal", auth="moderate", monitoring=0.75, ip="10.10.1.10", recovery_hours=24,
               software=[_sw(KESTREL, "GridView SCADA", "7.2.0", "application")],
               description="Supervisory control for all substations. Polls every gateway over IEC 60870-5-104."),
        _cyber("SCADA-002", "Standby SCADA Server", "scada", "DR", zone="dr", purdue=3, criticality=4, redundancy="medium",
               exposure="internal", auth="moderate", monitoring=0.6, ip="10.12.1.10", recovery_hours=24,
               software=[_sw(KESTREL, "GridView SCADA", "7.3.1", "application")],
               description="Hot-standby SCADA at the Powai disaster-recovery site."),
        _cyber("SCADA-003", "Process Historian", "scada", "CC", zone="dmz", purdue=3.5, criticality=3, redundancy="low",
               exposure="restricted", auth="weak", monitoring=0.45, ip="10.30.0.20", recovery_hours=12,
               software=[_sw(KESTREL, "Historian", "5.1.2", "application")],
               description="Stores operational time-series data. Reachable by corporate analysts through the DMZ.",
               tags=["dmz", "shared-service-account"]),
        # Gateways
        _cyber("GW-001", "Substation A Communication Gateway", "gateway", "SUB-A", zone="sub-a", purdue=2, criticality=5, redundancy="low",
               exposure="exposed", auth="moderate", monitoring=0.35, ip="10.21.0.1", recovery_hours=8,
               software=[_sw(VOLTARA, "SG-4000", "2.4.1")],
               description="Single communication path between Substation A's control LAN and the SCADA network.",
               tags=["legacy-firewall-rule"]),
        _cyber("GW-002", "Substation B Communication Gateway", "gateway", "SUB-B", zone="sub-b", purdue=2, criticality=4, redundancy="medium",
               exposure="internal", auth="strong", monitoring=0.7, ip="10.22.0.1", recovery_hours=8,
               software=[_sw(VOLTARA, "SG-4000", "2.4.3")],
               description="Communication gateway for Substation B. Patched to the latest firmware."),
        _cyber("GW-003", "Substation C Communication Gateway", "gateway", "SUB-C", zone="sub-c", purdue=2, criticality=4, redundancy="medium",
               exposure="internal", auth="moderate", monitoring=0.5, ip="10.23.0.1", recovery_hours=8,
               software=[_sw(VOLTARA, "SG-4000", "2.3.9")],
               description="Communication gateway for Substation C."),
        _cyber("GW-004", "Substation D Communication Gateway", "gateway", "SUB-D", zone="sub-d", purdue=2, criticality=3, redundancy="none",
               exposure="internal", auth="moderate", monitoring=0.4, ip="10.24.0.1", recovery_hours=10,
               software=[_sw(VOLTARA, "SG-3100", "1.9.2")],
               description="Older-generation gateway for Substation D. Looks routine, but it controls the telecom-exchange feeder."),
        _cyber("GW-005", "Substation E Communication Gateway", "gateway", "SUB-E", zone="sub-e", purdue=2, criticality=3, redundancy="high",
               exposure="internal", auth="moderate", monitoring=0.55, ip="10.25.0.1", recovery_hours=8,
               software=[_sw(VOLTARA, "SG-4000", "2.4")],
               description="Communication gateway for Substation E. Patch level unconfirmed in the inventory."),
        _cyber("GW-006", "IT/OT Boundary Gateway", "gateway", "CC", zone="dmz", purdue=3.5, criticality=4, redundancy="medium",
               exposure="restricted", auth="strong", monitoring=0.8, ip="10.30.0.1", recovery_hours=6,
               software=[_sw(VOLTARA, "SG-5200", "3.0.4")],
               description="Industrial DMZ gateway brokering corporate access to the historian."),
        _cyber("GW-007", "Vendor Remote Access Appliance", "remote_access", "CC", zone="dmz", purdue=3.5, criticality=3, redundancy="none",
               exposure="exposed", auth="weak", monitoring=0.5, ip="203.0.113.40", recovery_hours=6, internet_facing=True, remote_access=True,
               software=[_sw(ARCWAVE, "RA-200", "6.2.1")],
               description="Internet-facing VPN portal used by the integrator for maintenance. Vendor accounts lack MFA.",
               tags=["internet-facing", "third-party"]),
        _cyber("GW-008", "Substation E Cellular Backup Gateway", "gateway", "SUB-E", zone="sub-e", purdue=2, criticality=2, redundancy="n/a",
               exposure="exposed", auth="default", monitoring=0.2, ip="100.72.18.9", recovery_hours=4, internet_facing=True,
               software=[_sw(TARSIER, "LTE-M Router", "2.2.0")],
               description="Backup telemetry path over a public cellular network. Telnet management left enabled.",
               tags=["internet-facing", "default-credentials"]),
        # RTUs and PLCs
        _cyber("RTU-001", "Substation A RTU", "rtu", "SUB-A", zone="sub-a", purdue=1, criticality=5, redundancy="low",
               exposure="internal", auth="weak", monitoring=0.3, ip="10.21.1.10", recovery_hours=12,
               software=[_sw(MERIDIAN, "MRX-300", "4.0.2")],
               description="Remote terminal unit executing breaker commands for Substation A."),
        _cyber("RTU-002", "Substation B RTU", "rtu", "SUB-B", zone="sub-b", purdue=1, criticality=4, redundancy="medium",
               exposure="internal", auth="moderate", monitoring=0.6, ip="10.22.1.10", recovery_hours=12,
               software=[_sw(MERIDIAN, "MRX-300", "4.1.0")],
               description="Remote terminal unit for Substation B."),
        _cyber("RTU-003", "Substation C RTU", "rtu", "SUB-C", zone="sub-c", purdue=1, criticality=4, redundancy="medium",
               exposure="internal", auth="weak", monitoring=0.4, ip="10.23.1.10", recovery_hours=12,
               software=[_sw(MERIDIAN, "MRX-300", "4.0.5")],
               description="Remote terminal unit for Substation C."),
        _cyber("RTU-004", "Substation D RTU", "rtu", "SUB-D", zone="sub-d", purdue=1, criticality=4, redundancy="low",
               exposure="internal", auth="weak", monitoring=0.3, ip="10.24.1.10", recovery_hours=12,
               software=[_sw(MERIDIAN, "MRX-300", "4.0.x")],
               description="Remote terminal unit for Substation D. Exact firmware build not recorded."),
        _cyber("RTU-005", "Substation E RTU", "rtu", "SUB-E", zone="sub-e", purdue=1, criticality=3, redundancy="medium",
               exposure="internal", auth="weak", monitoring=0.35, ip="10.25.1.10", recovery_hours=12,
               software=[_sw(MERIDIAN, "MRX-300", "4.0.2")],
               description="Remote terminal unit for Substation E, reachable over primary and cellular paths."),
        _cyber("PLC-001", "Substation A Auto-Changeover PLC", "plc", "SUB-A", zone="sub-a", purdue=1, criticality=5, redundancy="low",
               exposure="internal", auth="weak", monitoring=0.3, ip="10.21.1.20", recovery_hours=16,
               software=[_sw(MERIDIAN, "MPC-20", "3.4.0")],
               description="Runs the automatic changeover between TX-A1 and TX-A2, protecting Zone A's backup supply."),
        _cyber("PLC-002", "Substation C Capacitor Bank PLC", "plc", "SUB-C", zone="sub-c", purdue=1, criticality=3, redundancy="medium",
               exposure="internal", auth="moderate", monitoring=0.45, ip="10.23.1.20", recovery_hours=10,
               software=[_sw(MERIDIAN, "MPC-20", "3.5.1")],
               description="Controls voltage support for the Water Pumping Station B feeder."),
        _cyber("PLC-003", "Protection Test-Bench PLC", "plc", "SUB-E", zone="bench", purdue=1, criticality=1, redundancy="high",
               exposure="isolated", auth="weak", monitoring=0.1, ip="192.168.50.5", recovery_hours=2,
               software=[_sw(MERIDIAN, "MPC-20", "3.1.4")],
               description="Air-gapped bench unit used to rehearse protection settings. Controls no live equipment.",
               tags=["air-gapped"]),
        # Engineering workstations
        _cyber("ENG-001", "Control Centre Engineering Workstation", "workstation", "CC", zone="supervisory", purdue=3, criticality=4, redundancy="medium",
               exposure="internal", auth="strong", monitoring=0.8, ip="10.10.2.21", recovery_hours=4,
               software=[_sw(CORVID, "EngStudio", "11.4.0", "application")],
               description="Configures SCADA and substation gateways. MFA enforced."),
        _cyber("ENG-002", "Substation A Maintenance Laptop", "workstation", "SUB-A", zone="sub-a", purdue=2, criticality=3, redundancy="low",
               exposure="internal", auth="moderate", monitoring=0.25, ip="10.21.2.30", recovery_hours=4,
               software=[_sw(CORVID, "EngStudio", "11.2.0", "application")],
               description="Field laptop used to program RTU-001 and PLC-001. Travels between sites."),
        _cyber("ENG-003", "Vendor Jump Workstation", "workstation", "CC", zone="dmz", purdue=3.5, criticality=2, redundancy="low",
               exposure="restricted", auth="weak", monitoring=0.2, ip="10.30.0.45", recovery_hours=4,
               software=[_sw(CORVID, "EngStudio", "10.4.2", "application")],
               description="Integrator jump host reached through the vendor VPN to support the SCADA application.",
               tags=["third-party"]),
        # Switches
        _cyber("SW-001", "Control Centre Core OT Switch", "switch", "CC", zone="supervisory", purdue=3, criticality=5, redundancy="medium",
               exposure="internal", auth="strong", monitoring=0.7, ip="10.10.0.2", recovery_hours=6,
               software=[_sw(HALDEN, "IXS-24", "5.2.0")],
               description="Core switch for the supervisory network."),
        _cyber("SW-002", "DMZ Switch", "switch", "CC", zone="dmz", purdue=3.5, criticality=3, redundancy="low",
               exposure="restricted", auth="moderate", monitoring=0.6, ip="10.30.0.2", recovery_hours=6,
               software=[_sw(HALDEN, "IXS-24", "5.0.1")],
               description="Switch for the industrial DMZ."),
        _cyber("SW-003", "Substation A LAN Switch", "switch", "SUB-A", zone="sub-a", purdue=2, criticality=4, redundancy="low",
               exposure="internal", auth="moderate", monitoring=0.3, ip="10.21.0.2", recovery_hours=6,
               software=[_sw(HALDEN, "IXS-24", "5.0.1")],
               description="Control LAN switch for Substation A."),
        _cyber("SW-004", "Substation B LAN Switch", "switch", "SUB-B", zone="sub-b", purdue=2, criticality=3, redundancy="medium",
               exposure="internal", auth="strong", monitoring=0.6, ip="10.22.0.2", recovery_hours=6,
               software=[_sw(HALDEN, "IXS-24", "5.2.0")],
               description="Control LAN switch for Substation B."),
        _cyber("SW-005", "Substation D LAN Switch", "switch", "SUB-D", zone="sub-d", purdue=2, criticality=3, redundancy="low",
               exposure="internal", auth="moderate", monitoring=0.3, ip="10.24.0.2", recovery_hours=6,
               software=[_sw(HALDEN, "IXS-24", "5.0")],
               description="Control LAN switch for Substation D."),
    ]

    assets += [
        _zone("ZONE-A", "Distribution Zone A — Dadar–Parel", 19.0130, 72.8440, 410_000, 182, 0.0105, 1),
        _zone("ZONE-B", "Distribution Zone B — Andheri", 19.1170, 72.8600, 520_000, 214, 0.0125, 2),
        _zone("ZONE-C", "Distribution Zone C — Kurla", 19.0745, 72.8890, 380_000, 156, 0.0100, 3),
        _zone("ZONE-D", "Distribution Zone D — Worli–Lower Parel", 19.0030, 72.8225, 290_000, 171, 0.0095, 4),
        _zone("ZONE-E", "Distribution Zone E — Ghatkopar", 19.0850, 72.9140, 340_000, 133, 0.0105, 5),
        _zone("ZONE-F", "Distribution Zone F — BKC–Bandra East", 19.0600, 72.8640, 210_000, 128, 0.0090, 6),
        _facility("HOSP-01", "City General Hospital — Parel", "hospital", 19.0035, 72.8415, population=1_800, beds=1_800, backup_hours=8,
                  criticality=5, description="Tertiary-care hospital with 1,800 beds. Diesel backup for about 8 hours."),
        _facility("HOSP-02", "Western Suburbs Hospital — Andheri", "hospital", 19.1225, 72.8500, population=650, beds=650, backup_hours=12,
                  criticality=5, description="650-bed hospital. Backup generation for about 12 hours."),
        _facility("HOSP-03", "Eastern Trauma Centre — Ghatkopar", "hospital", 19.0800, 72.9060, population=420, beds=420, backup_hours=6,
                  criticality=5, description="Level-1 trauma centre. Backup generation for about 6 hours."),
        _facility("WTR-01", "Water Pumping Station A — Dadar", "water", 19.0240, 72.8505, population=600_000, backup_hours=1.5,
                  criticality=5, description="Pumps potable water to roughly 600,000 residents and the Parel hospital."),
        _facility("WTR-02", "Water Pumping Station B — Kurla", "water", 19.0660, 72.8920, population=450_000, backup_hours=3,
                  criticality=4, description="Pumps potable water to roughly 450,000 residents and the trauma centre."),
        _facility("RAIL-01", "Suburban Rail Signalling Hub — Dadar", "rail", 19.0190, 72.8460, population=900_000, backup_hours=4,
                  criticality=5, description="Signalling for a suburban corridor carrying about 900,000 riders a day."),
        _facility("TEL-01", "Telecom Exchange — Worli", "telecom", 19.0110, 72.8150, population=1_100_000, backup_hours=10,
                  criticality=5, description="Carries the SCADA wide-area network plus hospital, rail and payments connectivity."),
        _facility("DC-01", "Payments Data Centre — BKC", "datacentre", 19.0640, 72.8690, population=300_000, backup_hours=18,
                  criticality=4, description="Processes retail payment traffic for the region."),
    ]
    return assets


def _cyber_edges() -> list[dict]:
    rows = [
        # id, source, target, protocol, port, purpose, policy, encrypted, authenticated, bidirectional
        ("C-01", "EXT-INTERNET", "GW-007", "HTTPS", 443, "Vendor VPN web portal", "allowed", True, True, False),
        ("C-02", "VENDOR-NET", "GW-007", "IPsec VPN", 500, "Vendor VPN tunnel", "allowed", True, True, False),
        ("C-03", "EXT-INTERNET", "GW-008", "Telnet", 23, "Router management over public cellular APN", "legacy_exception", False, False, False),
        ("C-04", "CORP-IT", "GW-006", "HTTPS", 443, "Corporate analysts reach the historian portal", "allowed", True, True, False),
        ("C-05", "CORP-IT", "GW-001", "HTTPS", 8443, "Gateway management (legacy firewall rule FW-CORP-117)", "legacy_exception", True, False, False),
        ("C-06", "GW-006", "SCADA-003", "HTTPS", 443, "Reverse proxy to historian", "allowed", True, True, False),
        ("C-07", "SCADA-001", "SCADA-003", "OPC UA", 4840, "Historian data replication", "allowed", True, True, False),
        ("C-08", "SCADA-001", "SCADA-002", "Replication", 7400, "Hot-standby synchronisation", "allowed", True, True, True),
        ("C-09", "ENG-001", "SCADA-001", "RDP", 3389, "SCADA engineering sessions", "allowed", True, True, False),
        ("C-10", "ENG-001", "GW-001", "SSH", 22, "Gateway maintenance", "allowed", True, True, False),
        ("C-11", "ENG-001", "GW-002", "SSH", 22, "Gateway maintenance", "allowed", True, True, False),
        ("C-12", "ENG-001", "GW-003", "SSH", 22, "Gateway maintenance", "allowed", True, True, False),
        ("C-13", "ENG-001", "GW-004", "SSH", 22, "Gateway maintenance", "allowed", True, True, False),
        ("C-14", "ENG-001", "GW-005", "SSH", 22, "Gateway maintenance", "allowed", True, True, False),
        ("C-15", "SCADA-001", "GW-001", "IEC 60870-5-104", 2404, "Telemetry and control polling", "allowed", False, False, False),
        ("C-16", "SCADA-001", "GW-002", "IEC 60870-5-104", 2404, "Telemetry and control polling", "allowed", False, False, False),
        ("C-17", "SCADA-001", "GW-003", "IEC 60870-5-104", 2404, "Telemetry and control polling", "allowed", False, False, False),
        ("C-18", "SCADA-001", "GW-004", "IEC 60870-5-104", 2404, "Telemetry and control polling", "allowed", False, False, False),
        ("C-19", "SCADA-001", "GW-005", "IEC 60870-5-104", 2404, "Telemetry and control polling", "allowed", False, False, False),
        ("C-20", "SCADA-002", "GW-002", "IEC 60870-5-104", 2404, "Standby polling path", "allowed", False, False, False),
        ("C-21", "GW-001", "RTU-001", "DNP3", 20000, "Breaker control for Substation A", "allowed", False, False, False),
        ("C-22", "GW-001", "PLC-001", "Modbus/TCP", 502, "Auto-changeover supervision", "allowed", False, False, False),
        ("C-23", "GW-002", "RTU-002", "DNP3", 20000, "Breaker control for Substation B", "allowed", False, False, False),
        ("C-24", "GW-003", "RTU-003", "DNP3", 20000, "Breaker control for Substation C", "allowed", False, False, False),
        ("C-25", "GW-003", "PLC-002", "Modbus/TCP", 502, "Capacitor bank supervision", "allowed", False, False, False),
        ("C-26", "GW-004", "RTU-004", "IEC 61850 MMS", 102, "Breaker control for Substation D", "allowed", False, False, False),
        ("C-27", "GW-005", "RTU-005", "DNP3", 20000, "Breaker control for Substation E", "allowed", False, False, False),
        ("C-28", "GW-008", "RTU-005", "DNP3", 20000, "Backup telemetry over cellular", "allowed", False, False, False),
        ("C-29", "SCADA-001", "GW-008", "IEC 60870-5-104", 2404, "Backup polling over private APN", "allowed", False, False, False),
        ("C-30", "ENG-002", "RTU-001", "Engineering/TCP", 2455, "RTU configuration", "allowed", False, True, False),
        ("C-31", "ENG-002", "PLC-001", "Engineering/TCP", 2455, "PLC logic programming", "allowed", False, False, False),
        ("C-32", "GW-007", "ENG-003", "RDP", 3389, "Vendor jump-host sessions", "allowed", True, True, False),
        ("C-33", "ENG-003", "GW-006", "SSH", 22, "Vendor maintenance of DMZ services", "controlled", True, True, False),
        ("C-34", "ENG-003", "SCADA-001", "Engineering/TCP", 2455, "Vendor support for the SCADA application", "controlled", True, True, False),
        ("C-35", "ENG-001", "GW-006", "SSH", 22, "Boundary gateway administration", "allowed", True, True, False),
    ]
    edges = []
    for eid, src, dst, proto, port, purpose, policy, enc, authd, bidir in rows:
        edges.append({
            "id": eid, "kind": "logical", "source": src, "target": dst, "protocol": proto, "port": port,
            "purpose": purpose, "policy": policy, "encrypted": enc, "authenticated": authd, "bidirectional": bidir,
            "status": "active", "monitored": policy != "legacy_exception", "last_observed_hours": 0.2 if eid != "C-20" else 504,
        })
    physical = [
        ("SW-001", ["SCADA-001", "ENG-001", "GW-006"]),
        ("SW-002", ["GW-006", "GW-007", "SCADA-003", "ENG-003"]),
        ("SW-003", ["GW-001", "RTU-001", "PLC-001", "ENG-002"]),
        ("SW-004", ["GW-002", "RTU-002"]),
        ("SW-005", ["GW-004", "RTU-004"]),
    ]
    n = 0
    for switch, ports in physical:
        for dev in ports:
            n += 1
            edges.append({
                "id": f"L-{n:02d}", "kind": "physical", "source": switch, "target": dev, "protocol": "Ethernet", "port": None,
                "purpose": "Switch port link", "policy": "allowed", "encrypted": False, "authenticated": False,
                "bidirectional": True, "status": "active", "monitored": True, "last_observed_hours": 0.1,
            })
    return edges


def _ops_edges() -> list[dict]:
    rows: list[tuple] = [
        # Control relationships: compromising the controller can impair the physical asset.
        ("controls", "RTU-001", "SUB-A", "primary", 1.0, "Executes breaker commands"),
        ("controls", "RTU-002", "SUB-B", "primary", 1.0, "Executes breaker commands"),
        ("controls", "RTU-003", "SUB-C", "primary", 1.0, "Executes breaker commands"),
        ("controls", "RTU-004", "SUB-D", "primary", 1.0, "Executes breaker commands"),
        ("controls", "RTU-005", "SUB-E", "primary", 1.0, "Executes breaker commands"),
        ("controls", "PLC-001", "TX-A1", "primary", 1.0, "Automatic changeover"),
        ("controls", "PLC-001", "TX-A2", "primary", 1.0, "Automatic changeover"),
        ("controls", "PLC-002", "TX-C2", "primary", 1.0, "Voltage support"),
        # Gateways carry telemetry: losing one blinds operators but does not cut power.
        ("telemetry", "GW-001", "SUB-A", "primary", 1.0, "Remote view and control path"),
        ("telemetry", "GW-002", "SUB-B", "primary", 1.0, "Remote view and control path"),
        ("telemetry", "GW-003", "SUB-C", "primary", 1.0, "Remote view and control path"),
        ("telemetry", "GW-004", "SUB-D", "primary", 1.0, "Remote view and control path"),
        ("telemetry", "GW-005", "SUB-E", "primary", 1.0, "Remote view and control path"),
        ("telemetry", "GW-008", "SUB-E", "backup", 0.6, "Cellular backup telemetry"),
        ("hosts", "CC-001", "SCADA-001", "primary", 1.0, "Hosted in control centre"),
        ("hosts", "CC-001", "SCADA-003", "primary", 1.0, "Hosted in control centre"),
        # Power flow
        ("feeds", "SUB-A", "TX-A1", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-A", "TX-A2", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-A", "TX-A3", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-B", "TX-B1", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-B", "TX-B2", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-C", "TX-C1", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-C", "TX-C2", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-C", "TX-C3", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-D", "TX-D1", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-D", "TX-D2", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-E", "TX-E1", "primary", 1.0, "33 kV bus"),
        ("feeds", "SUB-E", "TX-E2", "primary", 1.0, "33 kV bus"),
        ("supplies", "TX-A1", "ZONE-A", "primary", 1.0, "11 kV distribution"),
        ("supplies", "TX-A2", "ZONE-A", "backup", 0.6, "Standby via auto-changeover"),
        ("supplies", "TX-B1", "ZONE-B", "primary", 1.0, "11 kV distribution"),
        ("supplies", "TX-B2", "ZONE-B", "backup", 0.7, "Standby transformer"),
        ("supplies", "TX-C1", "ZONE-C", "primary", 1.0, "11 kV distribution"),
        ("supplies", "TX-C2", "ZONE-C", "backup", 0.5, "Standby transformer"),
        ("supplies", "TX-D1", "ZONE-D", "primary", 1.0, "11 kV distribution"),
        ("supplies", "TX-A2", "ZONE-D", "backup", 0.4, "Worli tie line from Dadar"),
        ("supplies", "TX-E1", "ZONE-E", "primary", 1.0, "11 kV distribution"),
        ("supplies", "TX-E2", "ZONE-E", "backup", 0.7, "Standby transformer"),
        ("supplies", "TX-C3", "ZONE-F", "primary", 1.0, "BKC feeder"),
        ("supplies", "TX-A3", "HOSP-01", "primary", 1.0, "Hospital Feeder 01"),
        ("supplies", "TX-A3", "RAIL-01", "primary", 1.0, "Dedicated signalling feeder"),
        ("supplies", "TX-D2", "TEL-01", "primary", 1.0, "Dedicated exchange feeder"),
        ("supplies", "TX-C2", "WTR-02", "primary", 1.0, "Pumping station feeder"),
        ("serves", "ZONE-A", "HOSP-01", "backup", 0.5, "Secondary hospital supply"),
        ("serves", "ZONE-A", "WTR-01", "primary", 1.0, "Pumping station supply"),
        ("serves", "ZONE-A", "RAIL-01", "backup", 0.5, "Secondary signalling supply"),
        ("serves", "ZONE-B", "HOSP-02", "primary", 1.0, "Hospital supply"),
        ("serves", "ZONE-C", "WTR-02", "backup", 0.5, "Secondary pumping supply"),
        ("serves", "ZONE-E", "HOSP-03", "primary", 1.0, "Trauma-centre supply"),
        ("serves", "ZONE-F", "DC-01", "primary", 1.0, "Data-centre supply"),
        ("serves", "ZONE-F", "CC-001", "primary", 1.0, "Control-centre supply"),
        ("serves", "ZONE-C", "DC-01", "backup", 0.5, "Secondary data-centre supply"),
        # Cross-sector dependencies
        ("water", "WTR-01", "HOSP-01", "primary", 1.0, "Potable water"),
        ("water", "WTR-02", "HOSP-03", "primary", 1.0, "Potable water"),
        ("comms", "TEL-01", "CC-001", "primary", 1.0, "SCADA wide-area network carrier"),
        ("comms", "TEL-01", "HOSP-01", "primary", 1.0, "Hospital voice and data"),
        ("comms", "TEL-01", "RAIL-01", "primary", 1.0, "Signalling communications"),
        ("comms", "TEL-01", "DC-01", "primary", 1.0, "Payments connectivity"),
    ]
    return [
        {"id": f"O-{i:02d}", "relation": rel, "source": src, "target": dst, "role": role, "capacity": cap, "description": desc}
        for i, (rel, src, dst, role, cap, desc) in enumerate(rows, start=1)
    ]


def _advisories() -> list[dict]:
    def adv(aid, title, vendor, product, affected, fixed, cvss, vector, cwe, exploit, kev, epss, published, summary, remediation):
        return {
            "id": aid, "title": title, "vendor": vendor, "product": product, "affected": affected, "fixed_version": fixed,
            "cvss": cvss, "cvss_vector": vector, "cwe": cwe, "exploit_maturity": exploit, "kev": kev, "epss": epss,
            "published": published, "summary": summary, "remediation": remediation, "source": "Synthetic NVD-format record",
            # SIM-2026-0417 is published during the flagship demo, so it starts outside the catalogue.
            "ingested": aid != "SIM-2026-0417",
        }

    return [
        adv("SIM-2026-0417", "Authentication bypass in SG-4000 web management interface", VOLTARA, "SG-4000", ">=2.0.0,<2.4.3", "2.4.3",
            8.1, "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H", "CWE-287", "functional", True, 0.61, "2026-10-27",
            "A crafted session cookie lets a remote attacker reach administrative functions without valid credentials.",
            "Upgrade firmware to 2.4.3 or later. Restrict the management interface to the engineering VLAN."),
        adv("SIM-2026-0388", "Improper input validation in SG-3100 IEC-104 handler", VOLTARA, "SG-3100", "<2.0.0", "2.0.1",
            6.5, "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H", "CWE-20", "poc", False, 0.08, "2026-08-14",
            "Malformed ASDUs from an adjacent network can restart the gateway and drop telemetry.",
            "Upgrade firmware to 2.0.1. Filter IEC-104 traffic to known SCADA masters."),
        adv("SIM-2026-0472", "Path traversal in RA-200 VPN portal discloses session tokens", ARCWAVE, "RA-200", "<6.4.0", "6.4.0",
            9.1, "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N", "CWE-22", "weaponized", True, 0.91, "2026-09-02",
            "Unauthenticated requests can read arbitrary files, including active session tokens.",
            "Upgrade to 6.4.0, invalidate all sessions, enforce MFA for vendor accounts."),
        adv("SIM-2026-0406", "Default credentials on LTE-M Router Telnet service", TARSIER, "LTE-M Router", "<2.5.0", "2.5.0",
            8.6, "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:L", "CWE-1392", "functional", False, 0.34, "2026-06-19",
            "Telnet ships enabled with a documented default password.",
            "Upgrade to 2.5.0, disable Telnet, rotate credentials, move management to the private APN."),
        adv("SIM-2026-0302", "Insecure deserialization in GridView HMI web client service", KESTREL, "GridView SCADA", ">=7.0.0,<7.3.0", "7.3.0",
            7.5, "CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:H", "CWE-502", "poc", False, 0.12, "2026-07-21",
            "An authenticated low-privilege user can execute code on the SCADA server via crafted session objects.",
            "Upgrade to 7.3.0. Disable the HMI web client where it is not needed."),
        adv("SIM-2026-0299", "SQL injection in Historian trend query API", KESTREL, "Historian", "<5.2.0", "5.2.0",
            8.6, "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N", "CWE-89", "functional", True, 0.57, "2026-05-30",
            "Unsanitised trend parameters allow arbitrary SQL against the historian database.",
            "Upgrade to 5.2.0. Replace the shared service account and restrict corporate access to read-only views."),
        adv("SIM-2026-0365", "Hard-coded credentials in MRX-300 maintenance service", MERIDIAN, "MRX-300", ">=4.0.0,<4.1.0", "4.1.0",
            7.6, "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:L", "CWE-798", "functional", False, 0.21, "2026-04-11",
            "A maintenance account with a fixed password accepts connections from the local control network.",
            "Upgrade to 4.1.0. Until then, block the maintenance port at the substation switch."),
        adv("SIM-2026-0451", "Unauthenticated remote code execution in MPC-20 programming service", MERIDIAN, "MPC-20", "<3.2.0", "3.2.0",
            9.8, "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "CWE-306", "poc", False, 0.18, "2026-09-25",
            "The programming service executes uploaded logic without authentication.",
            "Upgrade to 3.2.0 or later. Keep test equipment isolated from operational networks."),
        adv("SIM-2026-0344", "Missing authentication for logic download on MPC-20 programming port", MERIDIAN, "MPC-20", ">=3.2.0,<3.5.0", "3.5.0",
            8.1, "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H", "CWE-306", "poc", False, 0.09, "2026-03-08",
            "Devices on the same network segment can overwrite controller logic.",
            "Upgrade to 3.5.0. Enable the programming key switch and restrict the port to the maintenance laptop."),
        adv("SIM-2026-0333", "Out-of-bounds write when EngStudio parses project files", CORVID, "EngStudio", "<11.3.0", "11.3.0",
            7.8, "CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H", "CWE-787", "poc", False, 0.05, "2026-02-17",
            "Opening a crafted project file runs attacker code with the engineer's privileges.",
            "Upgrade to 11.3.0. Only open project files from the controlled repository."),
        adv("SIM-2026-0318", "SNMP community string disclosure via IXS-24 debug endpoint", HALDEN, "IXS-24", "<5.1.0", "5.1.0",
            5.3, "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N", "CWE-200", "poc", False, 0.04, "2026-01-22",
            "An unauthenticated debug page reveals the read-write SNMP community string.",
            "Upgrade to 5.1.0. Disable SNMPv2c and move to SNMPv3."),
        adv("SIM-2026-0290", "Information disclosure in SG-5200 diagnostics bundle", VOLTARA, "SG-5200", "<3.0.0", "3.0.0",
            4.3, "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N", "CWE-532", "none", False, 0.02, "2025-12-03",
            "Diagnostic bundles include cleartext configuration secrets.",
            "Upgrade to 3.0.0."),
    ]


# Historical events seeded relative to server start (hours ago).
HISTORY: list[dict] = [
    {"hours_ago": 26.0, "asset_id": None, "type": "scan", "severity": "info",
     "title": "Firmware inventory scan completed", "detail": "45 assets inventoried, 3 firmware versions changed since last scan."},
    {"hours_ago": 22.5, "asset_id": "GW-007", "type": "config_change", "severity": "medium",
     "title": "Remote access enabled for vendor maintenance window", "detail": "Integrator account 'kestrel-support' activated for 72 hours."},
    {"hours_ago": 20.1, "asset_id": "GW-001", "type": "config_change", "severity": "high",
     "title": "Legacy firewall rule FW-CORP-117 re-enabled",
     "detail": "During the core-switch migration, corporate → GW-001:8443 (management) was restored from an old policy backup.",
     "source": "CORP-IT", "destination": "GW-001", "protocol": "HTTPS/8443"},
    {"hours_ago": 18.0, "asset_id": "GW-007", "type": "vuln_detected", "severity": "critical",
     "title": "Advisory SIM-2026-0472 matched to GW-007", "detail": "Arcwave RA-200 6.2.1 is inside the affected range (<6.4.0). Known exploitation reported."},
    {"hours_ago": 12.4, "asset_id": "RTU-005", "type": "unexpected_comm", "severity": "medium",
     "title": "Undocumented session ENG-002 → RTU-005", "detail": "Modbus/TCP session observed. No such connection exists in the twin model.",
     "source": "ENG-002", "destination": "RTU-005", "protocol": "Modbus/TCP"},
    {"hours_ago": 9.2, "asset_id": "SCADA-001", "type": "unexpected_comm", "severity": "high",
     "title": "Undocumented session SCADA-003 → SCADA-001", "detail": "SMB session from the DMZ historian into the SCADA server. Not in the twin model.",
     "source": "SCADA-003", "destination": "SCADA-001", "protocol": "SMB/445"},
    {"hours_ago": 6.3, "asset_id": "RTU-003", "type": "telemetry", "severity": "info",
     "title": "NTP drift on RTU-003", "detail": "Clock offset 450 ms. Auto-corrected."},
    {"hours_ago": 3.1, "asset_id": "SCADA-002", "type": "telemetry", "severity": "low",
     "title": "Standby replication lag", "detail": "SCADA-002 replication lag reached 4 minutes before recovering."},
    {"hours_ago": 1.2, "asset_id": "GW-008", "type": "auth_failure", "severity": "medium",
     "title": "Telnet login attempts from public addresses", "detail": "3 failed logins from 2 internet addresses over the cellular APN.",
     "source": "EXT-INTERNET", "destination": "GW-008", "protocol": "Telnet/23"},
]

# The flagship demonstration from the blueprint: a vulnerable gateway in a critical substation.
FLAGSHIP: list[dict] = [
    {"delay": 0.0, "asset_id": "GW-001", "type": "vuln_detected", "severity": "high",
     "title": "Advisory SIM-2026-0417 ingested and matched",
     "detail": "Voltara SG-4000 <2.4.3 authentication bypass. Confirmed on GW-001 and GW-003, potential match on GW-005 (patch level unknown)."},
    {"delay": 3.0, "asset_id": "GW-001", "type": "unusual_connection", "severity": "medium", "activity": "unusual",
     "title": "Unusual connection attempt", "detail": "10.20.4.17 (Corporate IT) → GW-001:8443. Source has never contacted this gateway.",
     "source": "CORP-IT", "destination": "GW-001", "protocol": "HTTPS/8443"},
    {"delay": 5.5, "asset_id": "GW-001", "type": "unusual_connection", "severity": "medium", "activity": "unusual",
     "title": "Repeated connection attempts", "detail": "6 attempts in 60 seconds from 10.20.4.17.",
     "source": "CORP-IT", "destination": "GW-001", "protocol": "HTTPS/8443"},
    {"delay": 8.5, "asset_id": "GW-001", "type": "auth_failure", "severity": "high", "activity": "repeated",
     "title": "Repeated authentication failures", "detail": "14 failed logins on the management interface, then one session without a login event.",
     "source": "CORP-IT", "destination": "GW-001", "protocol": "HTTPS/8443"},
    {"delay": 11.5, "asset_id": "GW-001", "type": "unexpected_comm", "severity": "high", "activity": "repeated",
     "title": "Unexpected communication GW-001 → SCADA-001",
     "detail": "GW-001 opened an IEC-104 session to SCADA-001 from a non-standard port. SCADA normally initiates.",
     "source": "GW-001", "destination": "SCADA-001", "protocol": "IEC 60870-5-104"},
    {"delay": 14.0, "asset_id": "GW-001", "type": "alert", "severity": "critical", "activity": "repeated",
     "title": "Security alert generated", "detail": "Vulnerability and activity evidence combined. GW-001 escalated for immediate investigation."},
]

AMBIENT: list[dict] = [
    {"asset_id": "SCADA-001", "type": "telemetry", "severity": "info", "title": "IEC-104 poll cycle complete", "detail": "All 5 substations responded within 180 ms."},
    {"asset_id": "ENG-001", "type": "auth", "severity": "info", "title": "Engineer login (MFA verified)", "detail": "Shift engineer opened a SCADA session."},
    {"asset_id": "GW-002", "type": "telemetry", "severity": "info", "title": "Gateway heartbeat", "detail": "GW-002 healthy. CPU 12%."},
    {"asset_id": "SCADA-002", "type": "telemetry", "severity": "info", "title": "Standby sync complete", "detail": "Replication lag 2.1 s."},
    {"asset_id": "SW-004", "type": "scan", "severity": "info", "title": "Firmware inventory refreshed", "detail": "No version changes detected."},
    {"asset_id": "RTU-002", "type": "telemetry", "severity": "info", "title": "RTU time sync", "detail": "Offset 40 ms."},
    {"asset_id": "GW-006", "type": "telemetry", "severity": "low", "title": "Historian portal sessions", "detail": "12 corporate read-only sessions in the last hour."},
    {"asset_id": "SCADA-003", "type": "telemetry", "severity": "info", "title": "Historian compaction", "detail": "Nightly compaction finished. 4.2 GB reclaimed."},
    {"asset_id": "GW-005", "type": "telemetry", "severity": "info", "title": "Gateway heartbeat", "detail": "GW-005 healthy. Link quality 98%."},
    {"asset_id": "RTU-003", "type": "telemetry", "severity": "info", "title": "Breaker status poll", "detail": "11 kV feeders closed and healthy."},
]

MITIGATION_COSTS = {  # ₹ lakh, illustrative
    "patch": {"gateway": 2.0, "remote_access": 2.5, "scada": 4.0, "rtu": 1.5, "plc": 1.5, "workstation": 0.5, "switch": 1.0},
    "restrict_access": 1.0,
    "disable_remote_access": 0.5,
    "segment": 5.0,
    "disable_path": 0.5,
    "monitoring": 3.0,
    "mfa": 1.5,
    "redundancy": 6.0,
}


def build_dataset() -> dict:
    """Return a fresh deep copy of the synthetic dataset."""
    return deepcopy({
        "assets": _assets(),
        "cyber_edges": _cyber_edges(),
        "ops_edges": _ops_edges(),
        "advisories": _advisories(),
        "history": HISTORY,
    })

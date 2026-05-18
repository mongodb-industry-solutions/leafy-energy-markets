"""ESL Pydantic v2 entity models — auto-aligned to IEC 61970 CIM and ENTSO-E."""
from __future__ import annotations
from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class _ESLBase(BaseModel):
    model_config = {"populate_by_name": True, "arbitrary_types_allowed": True}
    _esl_version: str = "0.1"


class GeoLocation(_ESLBase):
    type: Literal["Point"] = "Point"
    coordinates: list[float] = Field(..., description="[longitude, latitude]")

    @field_validator("coordinates")
    @classmethod
    def validate_coords(cls, v: list[float]) -> list[float]:
        if len(v) != 2:
            raise ValueError("coordinates must be [lon, lat]")
        lon, lat = v
        if not (-180 <= lon <= 180):
            raise ValueError(f"longitude {lon} out of range")
        if not (-90 <= lat <= 90):
            raise ValueError(f"latitude {lat} out of range")
        return v


class Portfolio(_ESLBase):
    """_esl_entity: Portfolio | IEC CIM: PowerSystemResource"""
    id: Optional[str] = Field(None, alias="_id")
    name: str
    owner_id: Optional[str] = None
    sites: list[str] = Field(default_factory=list)
    market_zones: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    _esl_entity: str = "Portfolio"


class Site(_ESLBase):
    """_esl_entity: Site | Physical grouping of co-located assets"""
    id: Optional[str] = Field(None, alias="_id")
    name: str
    portfolio_id: Optional[str] = None
    location: Optional[GeoLocation] = None
    timezone: str = "UTC"
    country: Optional[str] = None
    assets: list[str] = Field(default_factory=list)
    _esl_entity: str = "Site"


class PVSystem(_ESLBase):
    """_esl_entity: PVSystem | IEC CIM: PhotoVoltaicUnit"""
    id: Optional[str] = Field(None, alias="_id")
    name: str
    asset_type: Literal["PV"] = "PV"
    site_id: Optional[str] = None
    portfolio_id: Optional[str] = None
    location: Optional[GeoLocation] = None
    capacity_kwp: float = Field(..., gt=0, description="Peak DC capacity (kWp)")
    surface_tilt: Optional[float] = Field(None, ge=0, le=90, description="Panel tilt (degrees)")
    surface_azimuth: Optional[float] = Field(None, ge=0, le=360, description="Panel azimuth")
    dc_ac_ratio: Optional[float] = Field(None, description="DC/AC ratio")
    technology_type: Optional[str] = None
    inverter_capacity_kw: Optional[float] = Field(None, gt=0)
    _esl_entity: str = "PVSystem"
    _iec_cim_class: str = "PhotoVoltaicUnit"


class WindFarm(_ESLBase):
    """_esl_entity: WindFarm | IEC CIM: WindGeneratingUnit"""
    id: Optional[str] = Field(None, alias="_id")
    name: str
    asset_type: Literal["WIND"] = "WIND"
    site_id: Optional[str] = None
    portfolio_id: Optional[str] = None
    location: Optional[GeoLocation] = None
    capacity_kw: float = Field(..., gt=0, description="Total installed capacity (kW)")
    num_turbines: int = Field(..., gt=0)
    hub_height_m: Optional[float] = Field(None, gt=0)
    rotor_diameter_m: Optional[float] = Field(None, gt=0)
    wind_class: Optional[str] = None
    offshore: bool = False
    _esl_entity: str = "WindFarm"
    _iec_cim_class: str = "WindGeneratingUnit"


class BatteryEnergyStorageSystem(_ESLBase):
    """_esl_entity: BatteryEnergyStorageSystem | IEC CIM: EnergyStorageUnit"""
    id: Optional[str] = Field(None, alias="_id")
    name: str
    asset_type: Literal["BESS"] = "BESS"
    site_id: Optional[str] = None
    portfolio_id: Optional[str] = None
    location: Optional[GeoLocation] = None
    storage_capacity_kwh: float = Field(..., gt=0, description="Nameplate capacity (kWh)")
    max_charge_kw: float = Field(..., gt=0, description="Max charge rate (kW)")
    max_discharge_kw: float = Field(..., gt=0, description="Max discharge rate (kW)")
    round_trip_efficiency: float = Field(..., ge=0, le=100, description="RTE (%)")
    chemistry: Optional[str] = None
    _esl_entity: str = "BatteryEnergyStorageSystem"
    _iec_cim_class: str = "EnergyStorageUnit"


class BiddingZone(_ESLBase):
    """_esl_entity: BiddingZone | IEC CIM: ControlArea | Standard: ENTSO-E"""
    id: Optional[str] = Field(None, alias="_id")
    name: str
    eic_code: str = Field(..., description="ENTSO-E Energy Identification Code")
    tso_operator: Optional[str] = None
    country_code: Optional[str] = None
    coupled_zones: list[str] = Field(default_factory=list)
    control_area: Optional[str] = None
    _esl_entity: str = "BiddingZone"
    _iec_cim_class: str = "ControlArea"


class ElectricityReading(_ESLBase):
    """Time-series electricity supply/demand reading"""
    id: Optional[str] = Field(None, alias="_id")
    asset_id: str
    metric_type: Literal["supply", "demand"]
    timestamp: datetime
    value_mw: float
    resolution_min: int = 15
    quality_flag: Literal["measured", "estimated", "substituted"] = "measured"
    _esl_entity: str = "ElectricityReading"


class ElectricityPrice(_ESLBase):
    """Day-ahead or intraday market price"""
    id: Optional[str] = Field(None, alias="_id")
    zone_eic: str
    price_type: Literal["DAM", "IDM", "BM"]
    timestamp: datetime
    price_eur_mwh: float
    source: Optional[str] = None
    _esl_entity: str = "ElectricityPrice"


class SOCReading(_ESLBase):
    """Battery state-of-charge time-series"""
    id: Optional[str] = Field(None, alias="_id")
    asset_id: str
    timestamp: datetime
    soc_pct: float = Field(..., ge=0, le=100)
    available_capacity_kwh: Optional[float] = None
    _esl_entity: str = "SOCReading"

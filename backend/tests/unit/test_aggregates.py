import pytest
from app.domain.aggregates import Instrument
from app.domain.events import InstrumentListed, PriceTickRecorded

def test_instrument_creation():
    """
    Tests that an instrument can be created and events are applied correctly.
    """
    instrument = Instrument(id="AAPL")
    
    events = [
        InstrumentListed(instrument_id="AAPL", name="Apple Inc."),
        PriceTickRecorded(instrument_id="AAPL", price=150.0)
    ]
    
    for event in events:
        instrument.apply(event)
        
    assert instrument.name == "Apple Inc."
    assert instrument.last_price == 150.0
    assert instrument.version == 2

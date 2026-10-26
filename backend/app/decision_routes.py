from typing import Any, Literal
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from . import decision, action_report

router=APIRouter(prefix='/api/decision',tags=['Evidence decision support'])
Mode=Literal['historical','current']
class Assumptions(BaseModel):
    name: str = Field(default='',max_length=160)
    cost: float | None = Field(default=None,ge=0,le=1e12,allow_inf_nan=False)
    months: float | None = Field(default=None,ge=0,le=1200,allow_inf_nan=False)
    notes: str = Field(default='',max_length=10000)
class Scenario(BaseModel):
    mode: Mode = 'historical'
    baseline_token: str = Field(min_length=64,max_length=64)
    changes: dict[str,Any] = Field(default_factory=dict,max_length=29)
    assumptions: Assumptions = Field(default_factory=Assumptions)

def call(fn,*args):
    try:return fn(*args)
    except KeyError as e:raise HTTPException(404,str(e)) from e
    except RuntimeError as e:raise HTTPException(409,str(e)) from e
    except ValueError as e:raise HTTPException(422,str(e)) from e

@router.get('/catalog')
def catalog(mode:Mode='historical'):return call(decision.catalog,mode)
@router.get('/profile/{slug}')
def profile(slug:str,mode:Mode='historical'):return call(decision.profile,slug,mode)
@router.get('/data/{slug}')
def data(slug:str,mode:Mode='historical'):
    p=call(decision.profile,slug,mode)
    return Response(decision.eng.json_dumps(p),media_type='application/json',headers={'Content-Disposition':f'attachment; filename="rdti-{p["slug"]}-{mode}-evidence.json"'})
@router.post('/simulate/{slug}')
def simulate(slug:str,req:Scenario):return call(decision.simulate,slug,req.mode,req.changes,req.baseline_token)
@router.post('/report/{slug}')
def report(slug:str,req:Scenario):
    result=call(decision.simulate,slug,req.mode,req.changes,req.baseline_token)
    p=call(decision.profile,slug,req.mode)
    if p['baseline_token']!=result['baseline_token']:raise HTTPException(409,'Evidence changed during export. Reload and retry.')
    pdf=action_report.generate(p,result,req.assumptions.model_dump())
    return Response(pdf,media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="rdti-{p["slug"]}-research-plan.pdf"'})

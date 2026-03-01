from fastapi import APIRouter

from app.api.routes import (
    auth,
    coach,
    constraints,
    energy,
    schedule,
    share,
    subjects,
    tasks,
    users,
    analytics,
)


api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(subjects.router, prefix="/subjects", tags=["subjects"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])
api_router.include_router(constraints.router, prefix="/constraints", tags=["constraints"])
api_router.include_router(schedule.router, prefix="/schedule", tags=["schedule"])
api_router.include_router(energy.router, prefix="/energy", tags=["energy"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
api_router.include_router(coach.router, prefix="/coach", tags=["coach"])
api_router.include_router(share.router, prefix="/share", tags=["share"])


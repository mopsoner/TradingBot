from sqlmodel import Session, SQLModel, create_engine

engine = create_engine("sqlite:///trading_platform.db", echo=False)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Session:
    return Session(engine)

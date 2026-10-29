install:
	python -m pip install -r requirements.txt

pipeline:
	python -m src.pipeline --config configs/config.yaml

dashboard:
	streamlit run dashboard/app.py

test:
	pytest -q

# Memanto + LangGraph Integrations

This directory contains several out-of-the-box examples demonstrating how to integrate Memanto's persistent memory capabilities into LangGraph agents. 

All examples share the core Memanto tools defined in core/memanto_tools.py.

## Directory Setup

`ash
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Memanto and OpenAI API keys
`

## Available Examples

* **asic_integration/**: A minimal, drop-in example of using Memanto tools within a simple LangGraph agent.
* **cross_session_recall/**: An agent designed to remember facts and preferences across different conversation sessions.
* **esearch_pipeline/**: A multi-agent setup where one agent researches and saves facts to Memanto, and another synthesizes them.
* **custom_memory_saver/**: An advanced implementation showing how to integrate Memanto directly at the LangGraph CheckpointSaver level.

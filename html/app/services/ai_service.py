import os
from typing import Optional, Dict, Any

class AIService:
    """
    Service for integrating powerful AI models (e.g., GPT-4, Claude 3).
    Currently configured for OpenAI GPT-4.
    """
    
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("AI_MODEL", "gpt-4-turbo-preview")
        self.client = None
        
        if self.api_key:
            try:
                from openai import AsyncOpenAI
                self.client = AsyncOpenAI(api_key=self.api_key)
            except ImportError:
                print("OpenAI library not installed. Please install 'openai' package.")

    async def analyze_student_performance(self, student_data: Dict[str, Any]) -> str:
        """
        Generates detailed analysis of student performance using AI.
        """
        if not self.client:
            return "AI service is not connected. Please configure OPENAI_API_KEY."

        prompt = f"""
        Analyze the following football student performance data and provide coaching advice:
        Student: {student_data.get('name')}
        Age: {student_data.get('age')}
        Stats: {student_data.get('stats')}
        
        Provide:
        1. Key strengths
        2. Areas for improvement
        3. Specific training recommendations
        """

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert football academy coach and analyst."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Error generating AI analysis: {str(e)}"

    async def generate_training_plan(self, group_level: str, focus_area: str) -> str:
        """
        Generates a training session plan based on group level and focus area.
        """
        if not self.client:
            return "AI service is not connected."

        prompt = f"Create a football training session for {group_level} level focusing on {focus_area}."
        
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a UEFA Pro License football coach."},
                    {"role": "user", "content": prompt}
                ]
            )
            return response.choices[0].message.content
        except Exception as e:
            return f"Error generating plan: {str(e)}"

ai_service = AIService()

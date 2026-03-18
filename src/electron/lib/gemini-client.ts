import axios from 'axios'

export class GeminiClient {
  private static readonly MODEL = 'gemini-1.5-flash'
  private static readonly API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:generateContent`

  /**
   * Gemini API를 호출하여 이미지 내의 6자리 보안숫자를 추출합니다.
   * @param base64Image - 데이터 URL 형식이 아닌 순수 base64 문자열
   * @param apiKey - Gemini API Key
   * @returns 추출된 6자리 숫자 문자열
   */
  public static async solveCaptcha(base64Image: string, apiKey: string): Promise<string> {
    if (!apiKey) {
      throw new Error('Gemini API Key가 설정되지 않았습니다.')
    }

    try {
      // 데이터 URL 형식(data:image/png;base64,...)인 경우 접두어 제거
      const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '')

      const response = await axios.post(
        `${this.API_URL}?key=${apiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: 'Extract the 6-digit number from this image. Output ONLY the number, nothing else.',
                },
                {
                  inline_data: {
                    mime_type: 'image/png',
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            topK: 64,
            maxOutputTokens: 10,
            responseMimeType: 'text/plain',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

      if (!text) {
        throw new Error('Gemini AI로부터 답변을 받지 못했습니다.')
      }

      // 숫자 이외의 문자 제거
      const result = text.replace(/[^0-9]/g, '')

      if (result.length !== 6) {
        throw new Error(`6자리 보안숫자를 추출하지 못했습니다. (추출결과: ${result})`)
      }

      return result
    } catch (error: any) {
      console.error('Gemini CAPTCHA solving error:', error?.response?.data || error.message)
      if (error?.response?.data?.error?.message) {
        throw new Error(`Gemini API 에러: ${error.response.data.error.message}`)
      }
      throw error
    }
  }
}

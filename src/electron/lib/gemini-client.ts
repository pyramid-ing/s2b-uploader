import axios from 'axios'

export class GeminiClient {
  private static readonly MODEL = 'gemini-2.5-flash'
  private static readonly API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${this.MODEL}:generateContent`
  private static readonly MAX_RETRIES = 2

  private static extractText(responseData: any): string {
    const candidate = responseData?.candidates?.[0]
    const parts = candidate?.content?.parts

    if (Array.isArray(parts)) {
      const text = parts
        .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim()

      if (text) {
        return text
      }
    }

    if (typeof responseData?.text === 'string' && responseData.text.trim()) {
      return responseData.text.trim()
    }

    return ''
  }

  /**
   * Gemini API를 호출하여 이미지 내의 6자리 보안문자를 추출합니다.
   * @param base64Image - 데이터 URL 형식이 아닌 순수 base64 문자열
   * @param apiKey - Gemini API Key
   * @returns 추출된 6자리 숫자 문자열
   */
  public static async solveCaptcha(base64Image: string, apiKey: string): Promise<string> {
    if (!apiKey) {
      throw new Error('Gemini API Key가 설정되지 않았습니다.')
    }

    // 데이터 URL 형식(data:image/png;base64,...)인 경우 접두어 제거
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '')

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt += 1) {
      try {
        const response = await axios.post(
          this.API_URL,
          {
            contents: [
              {
                parts: [
                  {
                    text: 'Extract the 6-digit number from this image. Output ONLY the 6-digit number.',
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
              maxOutputTokens: 32,
              responseMimeType: 'text/plain',
              thinkingConfig: {
                thinkingBudget: 0,
              },
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
          },
        )

        const text = this.extractText(response.data)

        if (!text) {
          console.warn('Gemini 보안문자 해독 응답 없음:', {
            attempt,
            finishReason: response.data?.candidates?.[0]?.finishReason,
            finishMessage: response.data?.candidates?.[0]?.finishMessage,
            promptFeedback: response.data?.promptFeedback,
            candidate: response.data?.candidates?.[0],
            usageMetadata: response.data?.usageMetadata,
          })

          if (attempt < this.MAX_RETRIES) {
            continue
          }

          const finishReason = response.data?.candidates?.[0]?.finishReason
          if (finishReason === 'MAX_TOKENS') {
            throw new Error('Gemini 응답이 토큰 제한에 걸렸습니다. thinkingBudget 또는 maxOutputTokens 설정을 확인해주세요.')
          }

          throw new Error('Gemini AI로부터 답변을 받지 못했습니다.')
        }

        // 숫자 이외의 문자 제거
        const result = text.replace(/[^0-9]/g, '')

        if (result.length !== 6) {
          throw new Error(`6자리 보안숫자를 추출하지 못했습니다. (추출결과: ${result})`)
        }

        return result
      } catch (error: any) {
        const apiMessage = error?.response?.data?.error?.message

        console.error('보안문자 해독 에러:', error?.response?.data || error.message)

        if (apiMessage) {
          throw new Error(`Gemini API 에러: ${apiMessage}`)
        }

        if (attempt >= this.MAX_RETRIES) {
          throw error
        }
      }
    }

    throw new Error('보안문자 해독 실패: 최대 재시도 횟수를 초과했습니다.')
  }
}

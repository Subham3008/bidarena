import express from 'express'

const app = express()

app.disable('x-powered-by')
app.use(express.json())

app.get('/health', (_request, response) => {
  response.status(200).json({
    success: true,
    message: 'BidArena server is running',
  })
})

export default app

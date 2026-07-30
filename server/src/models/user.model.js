import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    avatar: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 280,
      default: '',
    },
    location: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
  },
  {
    timestamps: true,
  },
)

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    displayName: this.displayName,
    email: this.email,
    avatar: this.avatar,
    bio: this.bio,
    location: this.location,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  }
}

export const User = mongoose.model('User', userSchema)

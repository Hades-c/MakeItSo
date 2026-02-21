import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  image?: string;
  major: string;
  minor?: string;
  graduationYear: number;
  currentYear: "Freshman" | "Sophomore" | "Junior" | "Senior" | "Graduate";
  bio?: string;
  careerInterests: string[];
  totalCreditsRequired: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, select: false },
    image: { type: String },
    major: { type: String, required: true, default: "Undecided" },
    minor: { type: String },
    graduationYear: { type: Number, required: true, default: new Date().getFullYear() + 4 },
    currentYear: {
      type: String,
      enum: ["Freshman", "Sophomore", "Junior", "Senior", "Graduate"],
      required: true,
      default: "Freshman",
    },
    bio: { type: String, maxlength: 500 },
    careerInterests: [{ type: String }],
    totalCreditsRequired: { type: Number, default: 128 },
  },
  { timestamps: true }
);

const User: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>("User", UserSchema);

export default User;

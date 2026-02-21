import mongoose, { Document, Model, Schema } from "mongoose";

export interface IMilestone {
  title: string;
  description?: string;
  dueDate?: Date;
  completed: boolean;
  completedAt?: Date;
}

export interface ICareerGoal extends Document {
  userId: mongoose.Types.ObjectId;
  targetRole: string;          // e.g. "Software Engineer at Google"
  careerField: string;         // e.g. "Software Engineering"
  targetCompanies: string[];
  targetGraduationDate: Date;
  skills: {
    name: string;
    proficiency: "beginner" | "intermediate" | "advanced";
    acquired: boolean;
  }[];
  milestones: IMilestone[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneSchema = new Schema<IMilestone>({
  title: { type: String, required: true },
  description: { type: String },
  dueDate: { type: Date },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date },
});

const CareerGoalSchema = new Schema<ICareerGoal>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetRole: { type: String, required: true, trim: true },
    careerField: { type: String, required: true, trim: true },
    targetCompanies: [{ type: String }],
    targetGraduationDate: { type: Date },
    skills: [
      {
        name: { type: String, required: true },
        proficiency: {
          type: String,
          enum: ["beginner", "intermediate", "advanced"],
          default: "beginner",
        },
        acquired: { type: Boolean, default: false },
      },
    ],
    milestones: [MilestoneSchema],
    notes: { type: String, maxlength: 2000 },
  },
  { timestamps: true }
);

const CareerGoal: Model<ICareerGoal> =
  mongoose.models.CareerGoal ??
  mongoose.model<ICareerGoal>("CareerGoal", CareerGoalSchema);

export default CareerGoal;

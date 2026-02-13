-- CreateTable
CREATE TABLE "UserCV" (
    "id" TEXT NOT NULL,
    "filename" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserCV_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCV_userId_key" ON "UserCV"("userId");

-- AddForeignKey
ALTER TABLE "UserCV" ADD CONSTRAINT "UserCV_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
